import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { Readable } from 'stream';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(readable: Readable): Promise<Buffer> {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey) {
    return res.status(500).json({ success: false, message: 'STRIPE_SECRET_KEY non configurée' });
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2025-01-27.accredited' as any,
  });

  let event: Stripe.Event;

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'] as string;

    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } else {
      // Fallback if webhook secret is not set (e.g., local development without CLI verification)
      // WARNING: In production, webhook secret MUST be verified!
      const unverifiedBody = JSON.parse(rawBody.toString());
      event = unverifiedBody as Stripe.Event;
      console.warn('Webhook signature verification skipped (STRIPE_WEBHOOK_SECRET is missing).');
    }
  } catch (err: any) {
    console.error(`Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Received Stripe event type: ${event.type}`);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.CheckoutSession;
      
      const userId = session.client_reference_id || session.metadata?.userId;
      const planId = session.metadata?.planId;

      if (userId && planId) {
        // Expand subscription or use defaults
        let newValidUntil = new Date();
        newValidUntil.setDate(newValidUntil.getDate() + 30);
        let subscriptionId = '';

        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          subscriptionId = subscription.id;
          newValidUntil = new Date(subscription.current_period_end * 1000);
        }

        // Update user
        const { error: userError } = await supabaseAdmin
          .from('users')
          .update({
            subscription_plan: planId,
            subscription_valid_until: newValidUntil.toISOString(),
          })
          .eq('id', userId);

        if (userError) throw userError;

        // Save payment
        const amountTotal = session.amount_total ? session.amount_total : 0;
        const currency = session.currency ? session.currency.toUpperCase() : 'XOF';

        const { error: paymentError } = await supabaseAdmin
          .from('payments')
          .upsert({
            user_id: userId,
            tx_ref: session.id,
            transaction_id: subscriptionId || session.payment_intent?.toString() || 'stripe_sub',
            amount: amountTotal,
            currency,
            plan_id: planId,
            status: 'success',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tx_ref' });

        if (paymentError) throw paymentError;
        console.log(`Successfully processed checkout.session.completed for user ${userId}`);
      }
    } else if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;
      
      // If it's a subscription invoice, extend the validity
      if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
        const userId = subscription.metadata?.userId || invoice.subscription_details?.metadata?.userId;
        const planId = subscription.metadata?.planId || invoice.subscription_details?.metadata?.planId;

        if (userId && planId) {
          const newValidUntil = new Date(subscription.current_period_end * 1000);

          // Update user
          await supabaseAdmin
            .from('users')
            .update({
              subscription_plan: planId,
              subscription_valid_until: newValidUntil.toISOString(),
            })
            .eq('id', userId);

          // Save payment
          await supabaseAdmin
            .from('payments')
            .insert({
              user_id: userId,
              tx_ref: invoice.id,
              transaction_id: subscription.id,
              amount: invoice.amount_paid,
              currency: invoice.currency.toUpperCase(),
              plan_id: planId,
              status: 'success',
            });
          
          console.log(`Successfully processed invoice.payment_succeeded for subscription ${subscription.id}`);
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('Webhook handler execution error:', error);
    return res.status(500).json({ error: error.message });
  }
}
