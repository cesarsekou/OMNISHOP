import { VercelRequest, VercelResponse } from '@vercel/node';
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
    const { transaction_id, tx_ref, plan_id, user_id } = req.body;

    if (!transaction_id || !tx_ref || !plan_id || !user_id) {
      return res.status(400).json({ success: false, message: 'Paramètres manquants' });
    }

    // 1. Appeler l'API Flutterwave pour vérifier la transaction
    const flwSecretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    if (!flwSecretKey) {
      return res.status(500).json({ success: false, message: 'FLUTTERWAVE_SECRET_KEY non configurée' });
    }

    const response = await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${flwSecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    const flwData = await response.json();

    if (flwData.status !== 'success' || flwData.data.status !== 'successful') {
      return res.status(400).json({ success: false, message: 'Paiement non validé chez Flutterwave' });
    }

    // Vérifier le montant et la devise
    const expectedAmount = plan_id === 'pro' ? 10000 : 5000;
    if (flwData.data.amount < expectedAmount || flwData.data.currency !== 'XOF') {
      return res.status(400).json({ success: false, message: 'Montant ou devise incorrect' });
    }

    // 2. Mettre à jour la base de données
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // Clé de rôle de service
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('subscription_valid_until')
      .eq('id', user_id)
      .single();

    const daysToAdd = 30;
    const now = new Date();
    let newValidUntil: Date;

    if (userData?.subscription_valid_until) {
      const existing = new Date(userData.subscription_valid_until);
      newValidUntil = existing > now
        ? new Date(existing.getTime() + daysToAdd * 86400000)
        : new Date(now.getTime() + daysToAdd * 86400000);
    } else {
      newValidUntil = new Date(now.getTime() + daysToAdd * 86400000);
    }

    const { error: userError } = await supabaseAdmin
      .from('users')
      .update({
        subscription_plan: plan_id,
        subscription_valid_until: newValidUntil.toISOString(),
      })
      .eq('id', user_id);

    if (userError) throw userError;

    // Enregistrer le paiement
    const { error: paymentError } = await supabaseAdmin
      .from('payments')
      .upsert({
        user_id,
        tx_ref,
        transaction_id: transaction_id.toString(),
        amount: flwData.data.amount,
        currency: flwData.data.currency,
        plan_id,
        status: 'success',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tx_ref' });

    if (paymentError) throw paymentError;

    return res.status(200).json({ success: true, newValidUntil });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
