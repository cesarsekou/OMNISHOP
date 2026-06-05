import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ success: false, message: 'session_id manquant' });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return res.status(500).json({ success: false, message: 'STRIPE_SECRET_KEY non configurée' });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-01-27.accredited' as any,
    });

    // Retrieve checkout session
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription'],
    });

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ success: false, message: 'La session de paiement n\'est pas réglée.' });
    }

    const userId = session.client_reference_id || session.metadata?.userId;
    const planId = session.metadata?.planId;

    if (!userId || !planId) {
      return res.status(400).json({ success: false, message: 'Métadonnées de session invalides' });
    }

    // Determine validity date from Stripe subscription
    let newValidUntil: Date;
    let subscriptionId = '';

    if (session.subscription) {
      const subscription = session.subscription as Stripe.Subscription;
      subscriptionId = subscription.id;
      newValidUntil = new Date(subscription.current_period_end * 1000);
    } else {
      // Fallback to 30 days
      newValidUntil = new Date();
      newValidUntil.setDate(newValidUntil.getDate() + 30);
    }

    // Connect to Supabase
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Update user subscription plan
    const { error: userError } = await supabaseAdmin
      .from('users')
      .update({
        subscription_plan: planId,
        subscription_valid_until: newValidUntil.toISOString(),
      })
      .eq('id', userId);

    if (userError) throw userError;

    // Save payment record
    const amountTotal = session.amount_total ? session.amount_total : 0;
    const currency = session.currency ? session.currency.toUpperCase() : 'XOF';

    const { error: paymentError } = await supabaseAdmin
      .from('payments')
      .upsert({
        user_id: userId,
        tx_ref: session.id,
        transaction_id: subscriptionId || session.payment_intent?.toString() || 'stripe_sub',
        amount: amountTotal, // Keep the original currency minor units, or divide by 100 if we want standard decimal. Wait! Flutterwave used 5000/10000 directly. Stripe returns amount in minor units (5000 XOF is 5000 XOF directly since XOF has 0 decimals in Stripe! Stripe treats XOF as zero-decimal currency, so session.amount_total will be exactly 5000 or 10000). That's perfect!
        currency,
        plan_id: planId,
        status: 'success',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tx_ref' });

    if (paymentError) throw paymentError;

    return res.status(200).json({ success: true, newValidUntil });
  } catch (error: any) {
    console.error('Error verifying Stripe payment:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
