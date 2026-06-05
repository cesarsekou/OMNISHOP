import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

export function useWhatsAppQueue(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    // S'abonner aux changements de la table whatsapp_queue pour ce marchand en temps réel
    const queueChannel = supabase
      .channel(`whatsapp_queue_client_notif:${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'whatsapp_queue',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        const newMsg = payload.new as any;
        const oldMsg = payload.old as any;

        // Si le statut passe à 'sent'
        if (newMsg && newMsg.status === 'sent' && (!oldMsg || oldMsg.status !== 'sent')) {
          const formattedPhone = newMsg.recipient_phone.replace(/[^0-9]/g, '');
          toast.success('Notification WhatsApp envoyée !', {
            description: `Destinataire : +${formattedPhone}`
          });
        }

        // Si le statut passe à 'failed'
        if (newMsg && newMsg.status === 'failed' && (!oldMsg || oldMsg.status !== 'failed')) {
          toast.error('Échec d\'envoi de la notification WhatsApp', {
            description: `Erreur : ${newMsg.error_message || 'Erreur d\'envoi'}`
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(queueChannel);
    };
  }, [userId]);
}
