import React, { useEffect, useState } from 'react';
import { Loader2, XCircle, ArrowLeft, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

export function OrderTracking({
  orderId,
  storeWhatsApp,
  currency,
  onClose,
  onClearTracking
}: {
  orderId: string;
  storeWhatsApp?: string;
  currency: string;
  onClose: () => void;
  onClearTracking: () => void;
}) {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Fetch initial order details
  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();
        if (data) {
          setOrder(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [orderId]);

  // Real-time subscription to order updates!
  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`live-tracking-${orderId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`
      }, (payload) => {
        if (payload.new) {
          setOrder(payload.new);
          toast.success("Mise à jour de commande !", {
            description: `Statut : ${
              payload.new.status === 'processing' ? 'En préparation' :
              payload.new.status === 'shipping' ? 'En cours de livraison' :
              payload.new.status === 'completed' ? 'Livrée / Prête !' :
              payload.new.status === 'cancelled' ? 'Annulée' : 'Reçue'
            }`
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-art-text mb-4" />
        <p className="text-xs uppercase font-bold tracking-widest text-art-muted animate-pulse">Connexion au suivi en direct...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center min-h-[400px]">
        <XCircle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-lg font-serif italic mb-2">Commande introuvable</h3>
        <p className="text-xs text-art-muted max-w-xs mb-6">Cette commande n'existe plus ou a été supprimée.</p>
        <button onClick={onClose} className="bg-art-text text-white text-[10px] uppercase font-bold tracking-widest px-6 py-3">
          Retour
        </button>
      </div>
    );
  }

  const steps = [
    { key: 'pending', label: 'Reçue', desc: 'Votre commande a été envoyée au vendeur.' },
    { key: 'processing', label: 'Préparation', desc: 'Le vendeur prépare avec soin vos articles.' },
    { key: 'shipping', label: 'En livraison', desc: 'Le livreur a récupéré votre commande et est en route.' },
    { key: 'completed', label: 'Livrée / Prête', desc: 'Votre commande est prête ou bien reçue !' }
  ];

  const currentStatus = order.status;
  const isCancelled = currentStatus === 'cancelled';

  // Determine active step index
  let activeStepIndex = 0;
  if (currentStatus === 'processing') activeStepIndex = 1;
  if (currentStatus === 'shipping') activeStepIndex = 2;
  if (currentStatus === 'completed') activeStepIndex = 3;

  const total = Number(order.total);

  return (
    <div className="p-6 relative max-w-2xl mx-auto">
      <button onClick={onClose} className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-art-muted mb-8 hover:text-art-text transition-colors">
        <ArrowLeft className="w-3 h-3" />
        Retour à la boutique
      </button>

      {/* Header with Live radar */}
      <div className="glass-surface border border-art-border p-5 rounded-xl mb-6 relative overflow-hidden">
        <div className="absolute top-4 right-4 flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-600 px-3 py-1 rounded-full text-[9px] uppercase font-mono tracking-wider font-semibold animate-pulse">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          Direct
        </div>

        <h2 className="text-2xl font-serif italic text-art-text">Suivi en direct</h2>
        <p className="text-[10px] font-mono text-art-muted mt-1 uppercase tracking-widest">N° de commande : #{order.id.slice(0, 8)}</p>
      </div>

      {/* Order Status Display */}
      {isCancelled ? (
        <div className="bg-red-500/10 border border-red-500/30 text-red-700 p-5 rounded-xl text-center mb-8">
          <XCircle className="w-12 h-12 mx-auto mb-3 text-red-600" />
          <h3 className="text-lg font-serif italic">Commande annulée</h3>
          <p className="text-xs text-red-600/80 mt-1">Désolé, cette commande a été annulée par le vendeur.</p>
        </div>
      ) : (
        <div className="space-y-6 mb-10 pl-4">
          {/* Visual scooter progress road simulator */}
          <div className="glass-surface border border-art-border p-5 rounded-xl mb-6 relative overflow-hidden bg-slate-50/20 shadow-inner">
            <span className="block text-[8px] uppercase font-bold tracking-widest text-art-muted mb-4 font-mono">
              Simulateur de livraison
            </span>
            <div className="relative w-full h-8 flex items-center">
              {/* The Road Line */}
              <div className="absolute left-0 right-0 h-0.5 border-t border-dashed border-art-border/80" />
              
              {/* Scooter Icon moving */}
              <div 
                className="absolute -top-3 w-7 h-7 flex items-center justify-center bg-white border border-art-border rounded-full shadow-md transition-all duration-1000 ease-out z-10"
                style={{ 
                  left: `calc(${activeStepIndex * 33.33}% - 14px)`,
                  borderColor: activeStepIndex >= 2 ? 'var(--color-art-accent)' : 'var(--color-art-border)'
                }}
              >
                {activeStepIndex === 3 ? (
                  <span className="text-xs">🎁</span>
                ) : (
                  <span className="text-xs animate-bounce">🛵</span>
                )}
              </div>
              
              {/* Pulsing hotspots for steps */}
              <div className="absolute inset-0 flex justify-between pointer-events-none items-center">
                {[0, 1, 2, 3].map((stepIdx) => {
                  const isPassedOrCurrent = stepIdx <= activeStepIndex;
                  return (
                    <div 
                      key={stepIdx} 
                      className={cn(
                        "w-2.5 h-2.5 rounded-full border-2 transition-all duration-500 relative bg-art-bg",
                        isPassedOrCurrent ? "border-art-text scale-110" : "border-art-border"
                      )}
                    >
                      {stepIdx === activeStepIndex && (
                        <span className="animate-ping absolute -inset-0.5 rounded-full bg-art-text/40 opacity-75"></span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-between text-[8px] uppercase tracking-wider font-bold text-art-muted mt-2">
              <span>Reçue</span>
              <span className="translate-x-1.5">Préparation</span>
              <span className="-translate-x-1.5">En Livraison</span>
              <span>Livrée</span>
            </div>
          </div>

          <div className="relative pl-8 border-l-2 border-art-border/40 ml-4 space-y-12 py-2">
            {steps.map((step, idx) => {
              const isPast = idx < activeStepIndex;
              const isCurrent = idx === activeStepIndex;
              const isFuture = idx > activeStepIndex;

              return (
                <div key={step.key} className="relative">
                  {/* Step Dot */}
                  <div className={cn(
                    "absolute -left-[41px] top-0 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-500 z-10",
                    isPast ? "bg-art-text border-art-text text-white" :
                    isCurrent ? "bg-art-bg border-art-text text-art-text scale-110 shadow-md" :
                    "bg-art-bg border-art-border text-art-muted"
                  )}>
                    {isPast ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <span className="text-[9px] font-bold font-mono">{idx + 1}</span>
                    )}
                    {isCurrent && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-art-text/20 opacity-75"></span>
                    )}
                  </div>

                  {/* Step Text */}
                  <div className={cn(
                    "transition-all duration-300",
                    isFuture ? "opacity-40" : "opacity-100"
                  )}>
                    <h3 className={cn(
                      "text-sm uppercase font-bold tracking-wider",
                      isCurrent ? "text-art-text font-extrabold" : "text-art-muted"
                    )}>
                      {step.label}
                    </h3>
                    <p className="text-xs text-art-muted mt-1">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recap details */}
      <div className="glass-surface border border-art-border p-5 rounded-xl mb-6">
        <h3 className="text-xs uppercase font-bold tracking-widest text-art-muted mb-4">Récapitulatif de livraison</h3>
        <div className="space-y-3 text-xs text-art-text">
          <div className="flex justify-between border-b border-art-border/30 pb-2">
            <span className="text-art-muted">Client :</span>
            <span className="font-semibold">{order.customer_name}</span>
          </div>
          <div className="flex justify-between border-b border-art-border/30 pb-2">
            <span className="text-art-muted">Téléphone :</span>
            <span className="font-semibold font-mono">{order.customer_phone}</span>
          </div>
          <div className="flex justify-between border-b border-art-border/30 pb-2">
            <span className="text-art-muted">Adresse :</span>
            <span className="font-semibold text-right max-w-[200px]">{order.customer_address}</span>
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-art-muted font-bold">Total réglé :</span>
            <span className="font-bold text-art-accent">{total.toFixed(0)} {currency}</span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 mt-8">
        {storeWhatsApp && (
          <a
            href={`https://wa.me/${storeWhatsApp.replace(/[^0-9]/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-[#25D366] text-white py-4 font-bold text-xs uppercase tracking-widest text-center shadow-lg active:scale-[0.99] transition-transform flex items-center justify-center gap-2 hover:bg-[#20ba5a]"
          >
            Contacter le vendeur
          </a>
        )}
        <button
          onClick={() => {
            onClearTracking();
            onClose();
          }}
          className="text-xs uppercase font-bold tracking-widest text-art-muted hover:text-red-500 transition-colors mt-6 border-b border-transparent hover:border-red-500 w-fit mx-auto pb-1"
        >
          Effacer le suivi de cette commande
        </button>
      </div>
    </div>
  );
}
