import React, { useEffect, useState, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { Loader2, MessageSquare, Check, AlertCircle, RefreshCw, Smartphone, Key, Settings, HelpCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { formatPhoneForWhatsApp } from '../../lib/utils';

interface WhatsAppSession {
  user_id: string;
  session_key: string;
  status: 'DISCONNECTED' | 'PAIRING' | 'CONNECTED';
  qr_code: string | null;
  auto_notify_orders: boolean;
  order_message_template: string;
  notify_on_processing: boolean;
  template_processing: string;
  notify_on_completed: boolean;
  template_completed: string;
  notify_on_cancelled: boolean;
  template_cancelled: string;
}

interface WhatsAppIntegrationProps {
  user: User;
}

export function WhatsAppIntegration({ user }: WhatsAppIntegrationProps) {
  const { storeData } = useAuth();
  const [session, setSession] = useState<WhatsAppSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [testingMessage, setTestingMessage] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  
  // Local settings states
  const [autoNotify, setAutoNotify] = useState(true);
  const [template, setTemplate] = useState('');
  
  const [notifyProcessing, setNotifyProcessing] = useState(true);
  const [templateProcessing, setTemplateProcessing] = useState('');
  
  const [notifyCompleted, setNotifyCompleted] = useState(true);
  const [templateCompleted, setTemplateCompleted] = useState('');
  
  const [notifyCancelled, setNotifyCancelled] = useState(true);
  const [templateCancelled, setTemplateCancelled] = useState('');

  // Active tab in settings editor
  const [activeEditTab, setActiveEditTab] = useState<'pending' | 'processing' | 'completed' | 'cancelled'>('pending');
  
  // API settings
  const openwaUrl = import.meta.env.VITE_OPENWA_API_URL || 'http://localhost:3000';
  const openwaApiKey = import.meta.env.VITE_OPENWA_API_KEY || '';

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionRef = useRef<WhatsAppSession | null>(null);

  // Keep ref in sync with session state for polling interval
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Diagnostic states
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [testingConnection, setTestingConnection] = useState(false);

  const addLog = (msg: string) => {
    setDebugLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const runDiagnostics = async () => {
    setTestingConnection(true);
    setDebugLogs([]);
    addLog("Début des diagnostics...");
    addLog(`API URL configurée: ${openwaUrl}`);
    addLog(`API Key configurée: ${openwaApiKey ? 'Définie (commence par ' + openwaApiKey.substring(0, 6) + '...)' : 'Non définie ❌'}`);

    // Test 1: Ping OpenWA API
    try {
      addLog("Test 1: Tentative de connexion à OpenWA /sessions...");
      const res = await fetch(`${openwaUrl}/sessions`, {
        headers: {
          'X-API-Key': openwaApiKey
        }
      });
      addLog(`Statut de la réponse: ${res.status} ${res.statusText}`);
      if (res.ok) {
        const data = await res.json();
        addLog(`Connexion réussie! Sessions actives trouvées: ${data.length}`);
        addLog(`Sessions: ${JSON.stringify(data)}`);
      } else {
        const text = await res.text();
        addLog(`Erreur de l'API OpenWA: ${text}`);
      }
    } catch (err: any) {
      addLog(`❌ Échec de connexion à l'API OpenWA: ${err.message || err}`);
      addLog("Conseil: Vérifiez que Docker tourne bien et que le port 2785 est accessible.");
    }

    // Test 2: Supabase connection
    try {
      addLog("Test 2: Lecture de la table whatsapp_sessions dans Supabase...");
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
        
      if (error) {
        addLog(`❌ Erreur Supabase: ${error.message} (Code: ${error.code})`);
      } else {
        addLog(`Lecture Supabase réussie! Données actuelles: ${JSON.stringify(data)}`);
      }
    } catch (err: any) {
      addLog(`❌ Échec de connexion à Supabase: ${err.message || err}`);
    }

    addLog("Diagnostics terminés.");
    setTestingConnection(false);
  };

  // Fetch session data from Supabase
  const fetchSession = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSession(data);
        setAutoNotify(data.auto_notify_orders);
        setTemplate(data.order_message_template);
        setNotifyProcessing(data.notify_on_processing ?? true);
        setTemplateProcessing(data.template_processing || `📦 *OmniShop | Votre commande se prépare !*

Bonjour {customer_name},

Vos articles pour la commande *#{order_id}* sont actuellement en cours de préparation et d'emballage par notre équipe.

📍 *Suivez l'avancement en direct :*
{tracking_link}

Préparez-vous à recevoir votre colis très bientôt ! Nous vous enverrons un message dès que le livreur sera en route. 🚀`);
        setNotifyCompleted(data.notify_on_completed ?? true);
        setTemplateCompleted(data.template_completed || `✨ *OmniShop | Commande Livrée !*

Bonjour {customer_name},

Nous espérons que vos articles vous plaisent ! Votre commande *#{order_id}* a été marquée comme livrée avec succès.

Merci infiniment de faire confiance à notre boutique. Votre satisfaction est notre priorité absolue.

À très bientôt pour vos prochains achats ! 🌟`);
        setNotifyCancelled(data.notify_on_cancelled ?? true);
        setTemplateCancelled(data.template_cancelled || `ℹ️ *OmniShop | Commande Annulée*

Bonjour {customer_name},

Nous vous informons que votre commande *#{order_id}* a été annulée.

Si vous n'êtes pas à l'origine de cette demande, ou si vous souhaitez modifier vos informations pour retenter l'achat, notre service client est à votre entière disposition.

📞 Répondez simplement à ce message WhatsApp pour nous contacter.

À bientôt.`);
        
        // If status is pairing, we start polling OpenWA API for status update
        if (data.status === 'PAIRING') {
          startPolling();
        } else {
          stopPolling();
        }
      } else {
        // No session exists in DB yet, create an initial disconnected state
        const initialSession: WhatsAppSession = {
          user_id: user.id,
          session_key: `session-${user.id.substring(0, 8)}`,
          status: 'DISCONNECTED',
          qr_code: null,
          auto_notify_orders: true,
          order_message_template: `🎉 *OmniShop | Commande Enregistrée !*

Bonjour {customer_name},

Bonne nouvelle ! Votre commande *#{order_id}* d'un montant de {total_amount} a bien été reçue et est en cours de validation.

📍 *Suivez votre commande en direct :*
{tracking_link}

Notre équipe va vérifier la disponibilité de vos articles et vous contactera très rapidement pour confirmer la livraison. Merci pour votre confiance ! 🙏`,
          notify_on_processing: true,
          template_processing: `📦 *OmniShop | Votre commande se prépare !*

Bonjour {customer_name},

Vos articles pour la commande *#{order_id}* sont actuellement en cours de préparation et d'emballage par notre équipe.

📍 *Suivez l'avancement en direct :*
{tracking_link}

Préparez-vous à recevoir votre colis très bientôt ! Nous vous enverrons un message dès que le livreur sera en route. 🚀`,
          notify_on_completed: true,
          template_completed: `✨ *OmniShop | Commande Livrée !*

Bonjour {customer_name},

Nous espérons que vos articles vous plaisent ! Votre commande *#{order_id}* a été marquée comme livrée avec succès.

Merci infiniment de faire confiance à notre boutique. Votre satisfaction est notre priorité absolue.

À très bientôt pour vos prochains achats ! 🌟`,
          notify_on_cancelled: true,
          template_cancelled: `ℹ️ *OmniShop | Commande Annulée*

Bonjour {customer_name},

Nous vous informons que votre commande *#{order_id}* a été annulée.

Si vous n'êtes pas à l'origine de cette demande, ou si vous souhaitez modifier vos informations pour retenter l'achat, notre service client est à votre entière disposition.

📞 Répondez simplement à ce message WhatsApp pour nous contacter.

À bientôt.`
        };
        
        // Insert initial configuration
        const { error: insertError } = await supabase
          .from('whatsapp_sessions')
          .insert(initialSession);
          
        if (insertError) {
          console.error('Error inserting initial WhatsApp config:', insertError);
        } else {
          setSession(initialSession);
          setAutoNotify(initialSession.auto_notify_orders);
          setTemplate(initialSession.order_message_template);
          setNotifyProcessing(initialSession.notify_on_processing);
          setTemplateProcessing(initialSession.template_processing);
          setNotifyCompleted(initialSession.notify_on_completed);
          setTemplateCompleted(initialSession.template_completed);
          setNotifyCancelled(initialSession.notify_on_cancelled);
          setTemplateCancelled(initialSession.template_cancelled);
        }
      }
    } catch (err) {
      console.error('Error fetching WhatsApp session:', err);
      toast.error('Impossible de charger les paramètres de WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
    
    // Subscribe to realtime updates for this user's whatsapp_session
    const channel = supabase
      .channel(`whatsapp_session:${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'whatsapp_sessions',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        const updated = payload.new as WhatsAppSession;
        setSession(updated);
        setAutoNotify(updated.auto_notify_orders);
        setTemplate(updated.order_message_template);
        setNotifyProcessing(updated.notify_on_processing ?? true);
        setTemplateProcessing(updated.template_processing || '');
        setNotifyCompleted(updated.notify_on_completed ?? true);
        setTemplateCompleted(updated.template_completed || '');
        setNotifyCancelled(updated.notify_on_cancelled ?? true);
        setTemplateCancelled(updated.template_cancelled || '');
        
        if (updated.status !== 'PAIRING') {
          stopPolling();
        } else {
          startPolling();
        }
      })
      .subscribe();

    return () => {
      stopPolling();
      supabase.removeChannel(channel);
    };
  }, [user.id]);

  // Polling logic to check status directly from OpenWA or update DB
  const startPolling = () => {
    if (pollIntervalRef.current) return;
    pollIntervalRef.current = setInterval(async () => {
      const currentSession = sessionRef.current;
      if (!currentSession) return;
      const currentSessionKey = currentSession.session_key;
      if (!currentSessionKey || currentSessionKey.startsWith('session-')) return;
      
      try {
        const response = await fetch(`${openwaUrl}/sessions/${currentSessionKey}`, {
          headers: {
            'X-API-Key': openwaApiKey
          }
        });
        if (response.ok) {
          const data = await response.json();
          // data.status could be 'ready', 'qr_ready', 'disconnected', 'failed', 'created', 'initializing'
          let dbStatus: 'DISCONNECTED' | 'PAIRING' | 'CONNECTED' = 'DISCONNECTED';
          let qrCode: string | null = null;
          
          if (data.status === 'ready') {
            dbStatus = 'CONNECTED';
          } else if (data.status === 'qr_ready' || data.status === 'initializing' || data.status === 'created') {
            dbStatus = 'PAIRING';
            // Fetch the QR code
            const qrResponse = await fetch(`${openwaUrl}/sessions/${currentSessionKey}/qr`, {
              headers: {
                'X-API-Key': openwaApiKey
              }
            });
            if (qrResponse.ok) {
              const qrData = await qrResponse.json();
              qrCode = qrData.qrCode || null;
            }
          }
          
          // Update DB if status or qr code changed
          if (currentSession.status !== dbStatus || currentSession.qr_code !== qrCode) {
            const { error } = await supabase
              .from('whatsapp_sessions')
              .update({ status: dbStatus, qr_code: qrCode, updated_at: new Date().toISOString() })
              .eq('user_id', user.id);
            if (error) console.error(error);
          }
        }
      } catch (err) {
        console.warn('Polling error (OpenWA server might be offline):', err);
      }
    }, 5000);
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Start a new session on OpenWA
  const handleConnect = async () => {
    if (!session) return;
    setInitializing(true);
    try {
      let openwaSessionId = session.session_key;
      
      // 1. Get the list of all sessions on OpenWA to check if it's already registered
      const listResponse = await fetch(`${openwaUrl}/sessions`, {
        headers: {
          'X-API-Key': openwaApiKey
        }
      });
      
      let existingSession = null;
      if (listResponse.ok) {
        const sessionsList = await listResponse.json();
        const expectedName = `session-${user.id.substring(0, 8)}`;
        existingSession = sessionsList.find((s: any) => s.name === expectedName);
      }
      
      if (existingSession) {
        openwaSessionId = existingSession.id;
      } else {
        // Create the session in OpenWA
        const createResponse = await fetch(`${openwaUrl}/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': openwaApiKey
          },
          body: JSON.stringify({ name: `session-${user.id.substring(0, 8)}` })
        });
        
        if (!createResponse.ok) {
          throw new Error('Impossible de créer la session sur OpenWA.');
        }
        const createdData = await createResponse.json();
        openwaSessionId = createdData.id;
      }
      
      // Update session_key (with the UUID) and status in our Supabase DB
      const { error } = await supabase
        .from('whatsapp_sessions')
        .update({
          session_key: openwaSessionId,
          status: 'PAIRING',
          qr_code: null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (error) throw error;
      
      // 2. Call OpenWA to start/initialize the session
      const startResponse = await fetch(`${openwaUrl}/sessions/${openwaSessionId}/start`, {
        method: 'POST',
        headers: {
          'X-API-Key': openwaApiKey
        }
      });

      if (!startResponse.ok && startResponse.status !== 400) {
        throw new Error('Erreur de réponse lors du démarrage de la session OpenWA');
      }

      toast.success('Session WhatsApp initialisée. Veuillez patienter pendant la génération du QR Code...');
      
      // Update the local state
      setSession(prev => prev ? { ...prev, session_key: openwaSessionId, status: 'PAIRING', qr_code: null } : null);
      
      // Wait a moment and trigger polling
      setTimeout(() => {
        startPolling();
      }, 1000);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Impossible de se connecter au serveur OpenWA. Assurez-vous que l\'URL de l\'API est correcte.');
    } finally {
      setInitializing(false);
    }
  };

  // Logout/Disconnect session on OpenWA
  const handleDisconnect = async () => {
    if (!session) return;
    if (!confirm('Êtes-vous sûr de vouloir déconnecter WhatsApp ?')) return;
    
    setInitializing(true);
    stopPolling();
    try {
      // Call OpenWA to delete/logout session
      if (!session.session_key.startsWith('session-')) {
        await fetch(`${openwaUrl}/sessions/${session.session_key}`, {
          method: 'DELETE',
          headers: {
            'X-API-Key': openwaApiKey
          }
        }).catch(err => console.warn('Could not call delete endpoint on OpenWA directly, updating local DB status anyway', err));
      }

      // Generate a new clean session name for potential future connection
      const newSessionKey = `session-${user.id.substring(0, 8)}`;

      const { error } = await supabase
        .from('whatsapp_sessions')
        .update({
          session_key: newSessionKey,
          status: 'DISCONNECTED',
          qr_code: null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (error) throw error;
      
      // Update local state
      setSession(prev => prev ? { ...prev, session_key: newSessionKey, status: 'DISCONNECTED', qr_code: null } : null);
      
      toast.success('WhatsApp déconnecté avec succès.');
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la déconnexion.');
    } finally {
      setInitializing(false);
    }
  };

  // Save auto-notify and message template settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setSavingSettings(true);
    try {
      const { error } = await supabase
        .from('whatsapp_sessions')
        .update({
          auto_notify_orders: autoNotify,
          order_message_template: template,
          notify_on_processing: notifyProcessing,
          template_processing: templateProcessing,
          notify_on_completed: notifyCompleted,
          template_completed: templateCompleted,
          notify_on_cancelled: notifyCancelled,
          template_cancelled: templateCancelled,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (error) throw error;
      toast.success('Paramètres enregistrés avec succès !');
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde des paramètres.');
    } finally {
      setSavingSettings(false);
    }
  };

  // Send a test message
  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !testPhone) return;
    setTestingMessage(true);
    try {
      // Use currently active template format but with placeholder values
      let testMsg = '';
      if (activeEditTab === 'pending') testMsg = template;
      else if (activeEditTab === 'processing') testMsg = templateProcessing;
      else if (activeEditTab === 'completed') testMsg = templateCompleted;
      else if (activeEditTab === 'cancelled') testMsg = templateCancelled;

      testMsg = testMsg.replace('{customer_name}', 'Didier (Test)');
      testMsg = testMsg.replace('{order_id}', 'TEST1234');
      testMsg = testMsg.replace('{total_amount}', '15000 FCFA');
      testMsg = testMsg.replace('{phone}', testPhone);
      testMsg = testMsg.replace('{tracking_link}', `http://localhost:3000/test-store?order=TEST1234`);
      
      const countryCode = storeData?.country || 'CI';
      const formattedPhone = formatPhoneForWhatsApp(testPhone, countryCode);

      // Insérer le message de test dans la file d'attente
      const { error } = await supabase.from('whatsapp_queue').insert({
        user_id: user.id,
        recipient_phone: formattedPhone,
        message_text: testMsg,
        status: 'pending'
      });

      if (error) throw error;
      
      toast.success('Message de test ajouté à la file d\'attente !', {
        description: 'Le worker WhatsApp va traiter l\'envoi en arrière-plan.'
      });
    } catch (err: any) {
      console.error(err);
      toast.error(`Échec du test : ${err.message || 'Impossible d\'ajouter le message à la file d\'attente'}`);
    } finally {
      setTestingMessage(false);
    }
  };

  const insertVariable = (variable: string) => {
    if (activeEditTab === 'pending') {
      setTemplate(prev => prev + variable);
    } else if (activeEditTab === 'processing') {
      setTemplateProcessing(prev => prev + variable);
    } else if (activeEditTab === 'completed') {
      setTemplateCompleted(prev => prev + variable);
    } else if (activeEditTab === 'cancelled') {
      setTemplateCancelled(prev => prev + variable);
    }
  };

  if (loading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-art-text" />
      </div>
    );
  }

  // Determine QR code image url. If OpenWA sends a raw text or base64
  let qrCodeImgUrl = '';
  if (session?.qr_code) {
    if (session.qr_code.startsWith('data:image') || session.qr_code.startsWith('http')) {
      qrCodeImgUrl = session.qr_code;
    } else {
      // Assume raw text, use public API to render QR
      qrCodeImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(session.qr_code)}`;
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10 py-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-serif italic text-art-text mb-2 flex items-center gap-3">
          <MessageSquare className="w-8 h-8 text-green-500" />
          Intégration WhatsApp
        </h1>
        <p className="text-sm text-art-muted">
          Connectez votre propre compte WhatsApp pour envoyer automatiquement des messages de confirmation de commande à vos clients.
        </p>
      </div>

      {/* Connection State Section */}
      <div className="glass-surface border border-art-border p-6 rounded-none relative">
        <div className="absolute -top-3 -right-3 w-6 h-6 border-t-2 border-r-2 border-art-text" />
        <div className="absolute -bottom-3 -left-3 w-6 h-6 border-b-2 border-l-2 border-art-text" />

        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-full ${
              session?.status === 'CONNECTED' 
                ? 'bg-green-500/10 text-green-500' 
                : session?.status === 'PAIRING' 
                  ? 'bg-amber-500/10 text-amber-500' 
                  : 'bg-red-500/10 text-red-500'
            }`}>
              <Smartphone className="w-8 h-8" />
            </div>
            <div>
              <div className="text-xs uppercase font-mono tracking-widest text-art-muted mb-1">Statut de la connexion</div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">
                  {session?.status === 'CONNECTED' && 'Connecté'}
                  {session?.status === 'PAIRING' && 'En attente de couplage'}
                  {session?.status === 'DISCONNECTED' && 'Déconnecté'}
                </span>
                <span className={`h-2.5 w-2.5 rounded-full ${
                  session?.status === 'CONNECTED' 
                    ? 'bg-green-500 animate-pulse' 
                    : session?.status === 'PAIRING' 
                      ? 'bg-amber-500 animate-pulse' 
                      : 'bg-red-500'
                }`} />
              </div>
              <p className="text-xs text-art-muted mt-1 font-mono">
                Clé de session: {session?.session_key}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            {session?.status === 'DISCONNECTED' && (
              <button
                onClick={handleConnect}
                disabled={initializing}
                className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs uppercase tracking-widest px-6 py-3 shadow-[4px_4px_0px_rgba(0,0,0,0.15)] flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              >
                {initializing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Connecter WhatsApp
              </button>
            )}

            {session?.status === 'PAIRING' && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleConnect}
                  disabled={initializing}
                  className="bg-transparent hover:bg-white/10 text-art-text border border-art-border font-bold text-xs uppercase tracking-widest px-4 py-3 flex items-center gap-2 transition-all"
                  title="Générer un nouveau QR Code"
                >
                  <RefreshCw className={`w-4 h-4 ${initializing ? 'animate-spin' : ''}`} />
                  Régénérer QR
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={initializing}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest px-6 py-3 shadow-[4px_4px_0px_rgba(0,0,0,0.15)] flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  Annuler
                </button>
              </div>
            )}

            {session?.status === 'CONNECTED' && (
              <button
                onClick={handleDisconnect}
                disabled={initializing}
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest px-6 py-3 shadow-[4px_4px_0px_rgba(0,0,0,0.15)] flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              >
                Déconnecter
              </button>
            )}
          </div>
        </div>

        {/* Pairing QR Code Section */}
        {session?.status === 'PAIRING' && (
          qrCodeImgUrl ? (
            <div className="mt-8 border-t border-art-border pt-8 flex flex-col md:flex-row items-center gap-8 bg-white/5 p-6 border border-white/10">
              <div className="bg-white p-4 rounded-lg flex items-center justify-center shadow-md">
                <img src={qrCodeImgUrl} alt="WhatsApp QR Code" className="w-48 h-48" />
              </div>
              <div className="space-y-4 max-w-md">
                <h3 className="font-serif italic text-lg font-bold">Instructions de couplage</h3>
                <ol className="text-sm list-decimal list-inside space-y-2 text-art-muted font-sans">
                  <li>Ouvrez WhatsApp sur votre téléphone portable.</li>
                  <li>Appuyez sur <span className="font-bold text-art-text">Menu</span> ou <span className="font-bold text-art-text">Paramètres</span>.</li>
                  <li>Sélectionnez <span className="font-bold text-art-text">Appareils connectés</span>.</li>
                  <li>Appuyez sur <span className="font-bold text-art-text">Connecter un appareil</span>.</li>
                  <li>Pointez l'appareil photo de votre téléphone vers ce QR code pour le scanner.</li>
                </ol>
                <div className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 p-3 rounded">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>Le QR code expire régulièrement. Cliquez sur <strong>Régénérer QR</strong> s'il n'est plus scannable.</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-8 border-t border-art-border pt-8 flex flex-col items-center justify-center p-8 bg-white/5 border border-white/10 text-center space-y-4">
              <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
              <div>
                <p className="font-bold text-sm text-art-text">Génération du QR Code en cours...</p>
                <p className="text-xs text-art-muted mt-1">Cela peut prendre quelques secondes. L'affichage s'actualisera automatiquement.</p>
              </div>
            </div>
          )
        )}
      </div>

      {/* Settings Panel */}
      {session && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Main settings form */}
          <div className="md:col-span-2 space-y-6">
            <div className="glass-surface border border-art-border p-6 rounded-none relative">
              <h2 className="text-xl font-serif italic text-art-text mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-art-accent" />
                Automatisation & Modèles de Message
              </h2>

              <p className="text-xs text-art-muted mb-6 font-sans">
                Personnalisez les messages WhatsApp envoyés à vos clients à chaque étape de leur commande. Activez ou désactivez les notifications individuellement pour chaque statut.
              </p>

              {/* Status Select Tabs */}
              <div className="flex border-b border-art-border mb-6 overflow-x-auto scrollbar-none whitespace-nowrap gap-1">
                {[
                  { id: 'pending', label: 'Nouvelle commande', active: activeEditTab === 'pending' },
                  { id: 'processing', label: 'En préparation', active: activeEditTab === 'processing' },
                  { id: 'completed', label: 'Livrée / Terminée', active: activeEditTab === 'completed' },
                  { id: 'cancelled', label: 'Annulée', active: activeEditTab === 'cancelled' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveEditTab(tab.id as any)}
                    className={`px-4 py-2 font-bold text-xs uppercase tracking-wider transition-all duration-300 border-b-2 cursor-pointer ${
                      tab.active
                        ? 'border-art-text text-art-text bg-white/5 font-semibold font-mono'
                        : 'border-transparent text-art-muted hover:text-art-text font-mono'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-6">
                {/* Active tab configuration */}
                {activeEditTab === 'pending' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5">
                      <div>
                        <label className="text-sm font-bold block mb-1">Confirmation de commande</label>
                        <span className="text-xs text-art-muted">Envoyer automatiquement ce message dès qu'un client valide son panier.</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={autoNotify}
                        onChange={(e) => setAutoNotify(e.target.checked)}
                        className="h-5 w-5 accent-green-600 cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs uppercase font-mono tracking-widest text-art-muted">Message de confirmation</label>
                      <textarea
                        rows={6}
                        value={template}
                        onChange={(e) => setTemplate(e.target.value)}
                        className="w-full glass border border-art-border p-3 focus:outline-none focus:border-art-text text-sm transition-colors bg-art-bg text-art-text font-sans resize-none"
                        placeholder="Ex: Bonjour {customer_name}, votre commande #{order_id} a été enregistrée..."
                      />
                    </div>
                  </div>
                )}

                {activeEditTab === 'processing' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5">
                      <div>
                        <label className="text-sm font-bold block mb-1">Commande en préparation</label>
                        <span className="text-xs text-art-muted">Envoyer ce message lorsque vous passez le statut de la commande en "En cours de préparation" (processing).</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifyProcessing}
                        onChange={(e) => setNotifyProcessing(e.target.checked)}
                        className="h-5 w-5 accent-green-600 cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs uppercase font-mono tracking-widest text-art-muted">Message de préparation</label>
                      <textarea
                        rows={6}
                        value={templateProcessing}
                        onChange={(e) => setTemplateProcessing(e.target.value)}
                        className="w-full glass border border-art-border p-3 focus:outline-none focus:border-art-text text-sm transition-colors bg-art-bg text-art-text font-sans resize-none"
                        placeholder="Ex: Bonjour {customer_name}, votre commande #{order_id} est en cours de préparation..."
                      />
                    </div>
                  </div>
                )}

                {activeEditTab === 'completed' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5">
                      <div>
                        <label className="text-sm font-bold block mb-1">Commande livrée / terminée</label>
                        <span className="text-xs text-art-muted">Envoyer ce message lorsque vous marquez la commande comme "Livrée / Terminée" (completed).</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifyCompleted}
                        onChange={(e) => setNotifyCompleted(e.target.checked)}
                        className="h-5 w-5 accent-green-600 cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs uppercase font-mono tracking-widest text-art-muted">Message de livraison</label>
                      <textarea
                        rows={6}
                        value={templateCompleted}
                        onChange={(e) => setTemplateCompleted(e.target.value)}
                        className="w-full glass border border-art-border p-3 focus:outline-none focus:border-art-text text-sm transition-colors bg-art-bg text-art-text font-sans resize-none"
                        placeholder="Ex: Bonjour {customer_name}, votre commande #{order_id} a été livrée..."
                      />
                    </div>
                  </div>
                )}

                {activeEditTab === 'cancelled' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5">
                      <div>
                        <label className="text-sm font-bold block mb-1">Commande annulée</label>
                        <span className="text-xs text-art-muted">Envoyer ce message lorsque la commande est marquée comme "Annulée" (cancelled).</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifyCancelled}
                        onChange={(e) => setNotifyCancelled(e.target.checked)}
                        className="h-5 w-5 accent-green-600 cursor-pointer"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs uppercase font-mono tracking-widest text-art-muted">Message d'annulation</label>
                      <textarea
                        rows={6}
                        value={templateCancelled}
                        onChange={(e) => setTemplateCancelled(e.target.value)}
                        className="w-full glass border border-art-border p-3 focus:outline-none focus:border-art-text text-sm transition-colors bg-art-bg text-art-text font-sans resize-none"
                        placeholder="Ex: Bonjour {customer_name}, votre commande #{order_id} a été annulée..."
                      />
                    </div>
                  </div>
                )}

                {/* Variables selector (Shared across all tabs) */}
                <div className="space-y-2 pt-2">
                  <span className="text-xs text-art-muted block mb-1">Insérer une variable dynamique dans le modèle actif :</span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'Nom client', value: '{customer_name}' },
                      { label: 'ID commande', value: '{order_id}' },
                      { label: 'Montant total', value: '{total_amount}' },
                      { label: 'Tél client', value: '{phone}' },
                      { label: 'Lien de suivi 📍', value: '{tracking_link}' }
                    ].map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => insertVariable(item.value)}
                        className={`bg-white/5 hover:bg-white/10 text-art-text border border-art-border text-[10px] uppercase font-bold tracking-widest px-2.5 py-1.5 transition-colors cursor-pointer ${
                          item.value === '{tracking_link}' ? 'border-green-500/50 hover:border-green-500 text-green-400' : ''
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Save button */}
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="w-full bg-art-text text-white py-3 font-bold text-xs uppercase tracking-widest shadow-[4px_4px_0px_rgba(0,0,0,0.15)] flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Enregistrer les modèles
                </button>
              </form>
            </div>
          </div>

          {/* Test Sending Panel */}
          <div className="space-y-6">
            <div className="glass-surface border border-art-border p-6 rounded-none relative">
              <h2 className="text-xl font-serif italic text-art-text mb-6 flex items-center gap-2">
                <Send className="w-5 h-5 text-art-accent" />
                Tester la passerelle
              </h2>

              <form onSubmit={handleSendTestMessage} className="space-y-4">
                <p className="text-xs text-art-muted">
                  Envoyez un message de test à un numéro WhatsApp pour vérifier le bon fonctionnement de votre passerelle.
                </p>
                <div>
                  <label className="block text-xs uppercase font-mono tracking-widest text-art-muted mb-2">Destinataire (Test)</label>
                  <input
                    required
                    type="tel"
                    placeholder="Ex: 0707070707 ou +2250707070707"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="w-full glass border border-art-border p-3 focus:outline-none focus:border-art-text text-sm transition-colors bg-art-bg text-art-text font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={testingMessage || session.status !== 'CONNECTED'}
                  className={`w-full py-3 font-bold text-xs uppercase tracking-widest shadow-[4px_4px_0px_rgba(0,0,0,0.15)] flex items-center justify-center gap-2 transition-all active:scale-95 ${
                    session.status === 'CONNECTED'
                      ? 'bg-green-600 hover:bg-green-700 text-white cursor-pointer'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'
                  }`}
                >
                  {testingMessage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Envoyer un test
                </button>
                {session.status !== 'CONNECTED' && (
                  <p className="text-[10px] text-red-500 text-center flex items-center gap-1 mt-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>WhatsApp doit être connecté pour faire un test.</span>
                  </p>
                )}
              </form>
            </div>
            
            {/* Help box */}
            <div className="bg-white/5 border border-white/10 p-5 space-y-3">
              <div className="flex items-center gap-2 text-art-text font-bold text-sm">
                <HelpCircle className="w-4 h-4 text-blue-400" />
                À propos d'OpenWA
              </div>
              <p className="text-xs text-art-muted leading-relaxed">
                OpenWA est une passerelle qui utilise le protocole WhatsApp Web sous-jacent. Il n'y a pas de frais par message.
              </p>
              <p className="text-xs text-art-muted leading-relaxed">
                Assurez-vous de ne pas envoyer de spam pour éviter que votre numéro soit suspendu par WhatsApp. Utilisez cette fonctionnalité uniquement pour des messages transactionnels légitimes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Panel de Diagnostic de Débogage */}
      <div className="border border-art-border bg-black/40 p-4 mt-8">
        <button
          type="button"
          onClick={() => setShowDebug(!showDebug)}
          className="text-xs uppercase font-mono tracking-widest text-art-muted hover:text-art-text transition-colors flex items-center gap-2"
        >
          <span>{showDebug ? '[-] Cacher' : '[+] Afficher'} le volet de diagnostic technique</span>
        </button>

        {showDebug && (
          <div className="mt-4 space-y-4 font-mono text-xs text-left">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={runDiagnostics}
                disabled={testingConnection}
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded transition-all active:scale-95 disabled:opacity-50"
              >
                {testingConnection ? 'Analyse en cours...' : 'Lancer les diagnostics'}
              </button>
              <button
                type="button"
                onClick={() => setDebugLogs([])}
                className="border border-zinc-700 hover:bg-zinc-800 text-zinc-400 px-3 py-1.5 rounded transition-all"
              >
                Effacer les logs
              </button>
            </div>

            <div className="bg-zinc-950 p-4 rounded border border-zinc-800 h-64 overflow-y-auto space-y-1 font-mono text-emerald-400 select-text selection:bg-emerald-900 selection:text-white">
              {debugLogs.length === 0 ? (
                <span className="text-zinc-600">Cliquez sur "Lancer les diagnostics" pour tester les connexions...</span>
              ) : (
                debugLogs.map((log, i) => (
                  <div key={i} className={log.includes('❌') || log.includes('Échec') || log.includes('Erreur') ? 'text-red-400' : log.includes('réussie') || log.includes('réussi') ? 'text-green-400' : 'text-emerald-400'}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
