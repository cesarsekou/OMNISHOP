import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const openwaUrl = process.env.VITE_OPENWA_API_URL || 'http://localhost:3000';
const openwaApiKey = process.env.VITE_OPENWA_API_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('\x1b[31m[Erreur]\x1b[0m Les variables VITE_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (ou VITE_SUPABASE_ANON_KEY) doivent être définies dans le fichier .env\x1b[0m');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
});

let isProcessing = false;

console.log('\x1b[36m%s\x1b[0m', '=========================================================');
console.log('\x1b[36m%s\x1b[0m', '   DÉMARRAGE DU WORKER WHATSAPP DE SOCIALSTORE-SAAS     ');
console.log('\x1b[36m%s\x1b[0m', '=========================================================');
console.log(`[Configuration] Supabase URL   : ${supabaseUrl}`);
console.log(`[Configuration] Authentification: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Service Role Key (Sécurisé - RLS contourné)' : 'Anon Key (Non-recommandé, RLS actif)'}`);
console.log(`[Configuration] OpenWA API URL : ${openwaUrl}`);
console.log(`[Configuration] OpenWA API Key : ${openwaApiKey ? 'Définie (commence par ' + openwaApiKey.substring(0, 6) + '...)' : 'Non définie'}`);
console.log('---------------------------------------------------------');

// Fonction pour traiter la file d'attente
async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // 1. Récupérer tous les messages 'pending'
    const { data: pendingMessages, error: queueError } = await supabase
      .from('whatsapp_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (queueError) {
      console.error('\x1b[31m%s\x1b[0m', `[Erreur Queue] Impossible de lire la file d'attente : ${queueError.message}`);
      isProcessing = false;
      return;
    }

    if (!pendingMessages || pendingMessages.length === 0) {
      isProcessing = false;
      return;
    }

    console.log(`\x1b[33m[Worker]\x1b[0m ${pendingMessages.length} message(s) en attente détecté(s).`);

    // 2. Traiter chaque message
    for (const msg of pendingMessages) {
      try {
        // Récupérer la session correspondante
        const { data: session, error: sessionError } = await supabase
          .from('whatsapp_sessions')
          .select('*')
          .eq('user_id', msg.user_id)
          .maybeSingle();

        if (sessionError || !session) {
          console.error(`\x1b[31m[Worker]\x1b[0m Aucune session WhatsApp configurée pour le marchand ${msg.user_id}`);
          // On marque en échec pour éviter de boucler indéfiniment dessus
          await supabase
            .from('whatsapp_queue')
            .update({ status: 'failed', error_message: 'Aucune session WhatsApp configurée' })
            .eq('id', msg.id);
          continue;
        }

        if (session.status !== 'CONNECTED') {
          console.warn(`\x1b[33m[Worker]\x1b[0m Session WhatsApp non connectée (Statut : ${session.status}) pour le marchand ${msg.user_id}. Message mis en attente.`);
          continue;
        }

        console.log(`\x1b[32m[Worker]\x1b[0m Envoi à +${msg.recipient_phone} pour le marchand ${msg.user_id}...`);
        const formattedPhone = msg.recipient_phone.replace(/[^0-9]/g, '');

        const response = await fetch(`${openwaUrl}/sessions/${session.session_key}/messages/send-text`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': openwaApiKey
          },
          body: JSON.stringify({
            chatId: `${formattedPhone}@c.us`,
            text: msg.message_text
          })
        });

        if (response.ok) {
          await supabase
            .from('whatsapp_queue')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              error_message: null
            })
            .eq('id', msg.id);
          console.log(`\x1b[32m[Worker]\x1b[0m Message ${msg.id} envoyé avec succès à +${formattedPhone} !`);
        } else {
          const errData = await response.json().catch(() => ({ message: 'Erreur inconnue de l\'API' }));
          throw new Error(errData.message || `API OpenWA a retourné un statut ${response.status}`);
        }
      } catch (err: any) {
        console.error(`\x1b[31m[Worker Error]\x1b[0m Échec pour le message ${msg.id} : ${err.message || err}`);
        const nextRetryCount = (msg.retry_count || 0) + 1;
        const maxRetries = msg.max_retries || 3;
        const willRetry = nextRetryCount < maxRetries;

        await supabase
          .from('whatsapp_queue')
          .update({
            status: willRetry ? 'pending' : 'failed',
            retry_count: nextRetryCount,
            error_message: err.message || err.toString()
          })
          .eq('id', msg.id);
      }

      // Petite pause entre chaque envoi
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  } catch (globalErr) {
    console.error('\x1b[31m%s\x1b[0m', `[Worker Global] Erreur inattendue : ${globalErr}`);
  } finally {
    isProcessing = false;
  }
}

// Lancement initial
processQueue();

// S'abonner aux changements en temps réel via Supabase Realtime
console.log('\x1b[35m%s\x1b[0m', '[Worker] Abonnement aux changements en temps réel de whatsapp_queue...');
const channel = supabase
  .channel('whatsapp_worker_queue')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'whatsapp_queue'
  }, () => {
    console.log('\x1b[35m%s\x1b[0m', '[Realtime] Nouveau message inséré, traitement lancé...');
    processQueue();
  })
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'whatsapp_queue'
  }, (payload) => {
    if (payload.new && (payload.new as any).status === 'pending') {
      console.log('\x1b[35m%s\x1b[0m', '[Realtime] Message mis à jour vers pending, traitement lancé...');
      processQueue();
    }
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('\x1b[32m%s\x1b[0m', '[Worker] Prêt ! En attente de nouveaux messages...');
    }
  });

// Gérer l'arrêt propre
process.on('SIGINT', () => {
  console.log('\x1b[33m%s\x1b[0m', '\nArrêt du worker WhatsApp...');
  channel.unsubscribe();
  process.exit(0);
});
