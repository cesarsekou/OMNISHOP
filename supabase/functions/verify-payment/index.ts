// supabase/functions/verify-payment/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { transaction_id, tx_ref, plan_id, user_id } = await req.json()

    if (!transaction_id || !tx_ref || !plan_id || !user_id) {
      return new Response(JSON.stringify({ success: false, message: "Paramètres manquants" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 1. Appeler l'API Flutterwave pour vérifier la transaction auprès de leur serveur
    const flwSecretKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY")
    if (!flwSecretKey) {
      throw new Error("La variable d'environnement FLUTTERWAVE_SECRET_KEY n'est pas configurée")
    }

    const response = await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${flwSecretKey}`,
        'Content-Type': 'application/json'
      }
    })

    const flwData = await response.json()

    if (flwData.status !== 'success' || flwData.data.status !== 'successful') {
      return new Response(JSON.stringify({ success: false, message: "Paiement non validé chez Flutterwave" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Vérifier le montant attendu pour le forfait sélectionné (Essential: 5000 FCFA, Pro: 10000 FCFA)
    const expectedAmount = plan_id === 'pro' ? 10000 : 5000
    if (flwData.data.amount < expectedAmount || flwData.data.currency !== 'XOF') {
      return new Response(JSON.stringify({ success: false, message: "Montant ou devise incorrect" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Initialiser le client Supabase avec la clé de rôle de service (Admin bypass RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Calculer la nouvelle date d'expiration (+30 jours)
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('subscription_valid_until')
      .eq('id', user_id)
      .single()

    const daysToAdd = 30
    const now = new Date()
    let newValidUntil: Date

    if (userData?.subscription_valid_until) {
      const existing = new Date(userData.subscription_valid_until)
      newValidUntil = existing > now
        ? new Date(existing.getTime() + daysToAdd * 86400000)
        : new Date(now.getTime() + daysToAdd * 86400000)
    } else {
      newValidUntil = new Date(now.getTime() + daysToAdd * 86400000)
    }

    // Mettre à jour les privilèges du marchand
    const { error: userError } = await supabaseAdmin
      .from('users')
      .update({
        subscription_plan: plan_id,
        subscription_valid_until: newValidUntil.toISOString(),
      })
      .eq('id', user_id)

    if (userError) throw userError

    // Insérer ou mettre à jour la ligne de paiement
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
        updated_at: new Date().toISOString()
      }, { onConflict: 'tx_ref' })

    if (paymentError) throw paymentError

    return new Response(JSON.stringify({ success: true, newValidUntil }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
