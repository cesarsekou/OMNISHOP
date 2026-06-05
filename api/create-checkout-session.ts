import { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

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
    const { planId, userId, userEmail } = req.body;

    if (!planId || !userId) {
      return res.status(400).json({ success: false, message: 'Paramètres manquants (planId, userId)' });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return res.status(500).json({ success: false, message: 'STRIPE_SECRET_KEY non configurée' });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-01-27.accredited' as any, // fallback standard
    });

    // Map plans to Stripe price IDs
    const PRICE_IDS: { [key: string]: string } = {
      essential: 'price_1Tej4QRvsdojBHzYmjoIgUBo',
      pro: 'price_1Tej4gRvsdojBHzYCyulOEMf',
    };

    const priceId = PRICE_IDS[planId];
    if (!priceId) {
      return res.status(400).json({ success: false, message: 'Plan invalide' });
    }

    // Determine the host for redirect URLs
    let host = 'http://localhost:3000';
    if (req.headers.host) {
      // Vercel dev sets host header
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      host = `${protocol}://${req.headers.host}`;
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'], // Add other payment methods if needed/supported in settings
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: userEmail || undefined,
      client_reference_id: userId,
      metadata: {
        userId,
        planId,
      },
      success_url: `${host}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${host}/dashboard/billing?status=cancelled`,
    });

    return res.status(200).json({ success: true, url: session.url });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
