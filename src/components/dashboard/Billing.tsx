import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useFlutterwave, closePaymentModal } from 'flutterwave-react-v3';
import { CreditCard, CheckCircle2, AlertCircle, Loader2, History, RefreshCw, XCircle, Check } from 'lucide-react';
import { toast } from 'sonner';

interface BillingProps {
  user: User;
}

const PLANS = [
  { id: 'essential', name: 'Essentiel', price: 5000, description: 'Pour se lancer sur les réseaux.' },
  { id: 'pro', name: 'Pro', price: 10000, description: 'Pour les boutiques avec du volume.' }
];

interface PlanCardProps {
  plan: typeof PLANS[0];
  isCurrentPlan: boolean;
  user: User;
  storeName: string;
  onSuccess: (planId: string, newValidUntil: Date) => void;
}

const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  isCurrentPlan,
  user,
  storeName,
  onSuccess,
}) => {
  const [processing, setProcessing] = useState(false);
  const [txRef, setTxRef] = useState(`txn_${Date.now()}_${user.id}`);

  // Re-générer un tx_ref à chaque fois que la transaction se termine
  const resetTxRef = () => {
    setTxRef(`txn_${Date.now()}_${user.id}`);
  };

  const config = {
    public_key: import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY || 'FLWPUBK_TEST-SANDBOXDEMOKEY-X',
    tx_ref: txRef,
    amount: plan.price,
    currency: 'XOF',
    payment_options: 'card,mobilemoneyfranco',
    customer: {
      email: user.email || 'marchand@omnishop.com',
      phone_number: '',
      name: storeName || 'Marchand OmniShop',
    },
    customizations: {
      title: `Abonnement ${plan.name}`,
      description: 'Renouvellement 30 jours',
      logo: 'https://st2.depositphotos.com/4403291/7418/v/450/depositphotos_74189661-stock-illustration-online-shop-log.jpg',
    },
  };

  const handleFlutterwavePayment = useFlutterwave(config);

  const handlePay = async () => {
    setProcessing(true);
    
    // 1. Résilience : Pré-enregistrer le paiement comme initié ('pending')
    try {
      await supabase.from('payments').insert({
        user_id: user.id,
        tx_ref: txRef,
        amount: plan.price,
        plan_id: plan.id,
        status: 'pending'
      });
    } catch (err) {
      console.error("Erreur lors du pré-enregistrement du paiement:", err);
    }

    handleFlutterwavePayment({
      callback: async (response: any) => {
        if (response.status === 'successful' || response.status === 'completed') {
          toast.loading('Validation sécurisée du paiement...');
          try {
            // Détecter l'URL du service de validation
            let verifyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-payment`;
            if (import.meta.env.VITE_API_URL) {
              verifyUrl = `${import.meta.env.VITE_API_URL}/api/verify-payment`;
            } else if (window.location.hostname === 'localhost') {
              verifyUrl = 'http://localhost:3000/api/verify-payment';
            }

            const res = await fetch(verifyUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                transaction_id: response.transaction_id || response.id,
                tx_ref: txRef,
                plan_id: plan.id,
                user_id: user.id
              })
            });

            const result = await res.json();
            if (res.ok && result.success) {
              toast.dismiss();
              toast.success(`Félicitations ! Votre forfait ${plan.name} est activé.`);
              onSuccess(plan.id, new Date(result.newValidUntil));
            } else {
              throw new Error(result.message || 'La vérification a échoué');
            }
          } catch (err: any) {
            toast.dismiss();
            console.error("Erreur validation paiement:", err);
            toast.error(err.message || 'Erreur lors de la validation du paiement.');
            
            // Réconciliation / Plan B : Marquer en 'pending_verification' pour vérification manuelle ultérieure
            try {
              await supabase.from('payments').upsert({
                user_id: user.id,
                tx_ref: txRef,
                transaction_id: (response.transaction_id || response.id)?.toString(),
                amount: plan.price,
                plan_id: plan.id,
                status: 'pending_verification',
                updated_at: new Date().toISOString()
              }, { onConflict: 'tx_ref' });
              
              toast.info('Votre transaction a été enregistrée pour une réconciliation manuelle.');
            } catch (dbErr) {
              console.error(dbErr);
            }
            onSuccess(plan.id, new Date());
          }
        } else {
          toast.error("Paiement non finalisé.");
          try {
            await supabase.from('payments').update({ status: 'failed' }).eq('tx_ref', txRef);
          } catch (dbErr) {
            console.error(dbErr);
          }
        }
        closePaymentModal();
        setProcessing(false);
        resetTxRef();
      },
      onClose: () => {
        setProcessing(false);
        resetTxRef();
      },
    });
  };

  return (
    <div className={`glass p-8 flex flex-col relative group overflow-hidden border transition-colors ${isCurrentPlan ? 'border-art-accent' : 'border-art-border hover:border-art-text/50'}`}>
      {isCurrentPlan && (
        <div className="absolute top-0 right-0 bg-art-accent text-white text-[10px] uppercase tracking-widest font-bold px-4 py-1">
          Forfait Actuel
        </div>
      )}
      <div className="mb-8">
        <h3 className="text-2xl font-bold tracking-tight mb-2">{plan.name}</h3>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-4xl font-serif italic text-art-text">{plan.price.toLocaleString()}</span>
          <span className="text-xs text-art-muted font-mono">FCFA / 30 jours</span>
        </div>
        <p className="text-xs text-art-muted uppercase tracking-widest leading-relaxed">{plan.description}</p>
      </div>
      <div className="mt-auto pt-6 border-t border-art-border">
        <button
          onClick={handlePay}
          disabled={processing}
          className="w-full flex items-center justify-center gap-2 bg-art-text text-white py-4 font-bold text-xs uppercase tracking-widest active:scale-[0.99] transition-transform shadow-[4px_4px_0px_rgba(0,0,0,0.1)] hover:translate-y-px hover:shadow-[2px_2px_0px_rgba(0,0,0,0.1)] disabled:opacity-50"
        >
          {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-4 h-4" />}
          {isCurrentPlan ? 'Renouveler ce forfait' : 'Passer à ce forfait'}
        </button>
        <p className="text-center text-[10px] text-art-muted mt-3 font-mono">
          Paiement sécurisé par Flutterwave (Mobile Money, Carte)
        </p>
      </div>
    </div>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────────
export function Billing({ user }: BillingProps) {
  const { storeData, refreshStoreData } = useAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const fetchPayments = async () => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPayments(data || []);
    } catch (err) {
      console.error("Erreur lors de la récupération des paiements:", err);
    } finally {
      setLoadingPayments(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [user.id]);

  const handleVerifyPayment = async (payment: any) => {
    if (!payment.transaction_id) {
      toast.error("Impossible de vérifier : ID de transaction manquant.");
      return;
    }

    setVerifyingId(payment.id);
    toast.loading('Vérification du paiement auprès de Flutterwave...');

    try {
      let verifyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-payment`;
      if (import.meta.env.VITE_API_URL) {
        verifyUrl = `${import.meta.env.VITE_API_URL}/api/verify-payment`;
      } else if (window.location.hostname === 'localhost') {
        verifyUrl = 'http://localhost:3000/api/verify-payment';
      }

      const res = await fetch(verifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transaction_id: payment.transaction_id,
          tx_ref: payment.tx_ref,
          plan_id: payment.plan_id,
          user_id: user.id
        })
      });

      const result = await res.json();
      if (res.ok && result.success) {
        toast.dismiss();
        toast.success("Paiement validé avec succès ! Abonnement prolongé.");
        refreshStoreData();
        fetchPayments();
      } else {
        throw new Error(result.message || 'Le paiement n\'a pas pu être validé.');
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || 'Erreur lors de la vérification.');
    } finally {
      setVerifyingId(null);
    }
  };

  const getStatus = () => {
    if (!storeData?.subscription_plan || storeData.subscription_plan === 'free') {
      return { type: 'danger', msg: 'Aucun abonnement actif.' };
    }
    if (!storeData.subscription_valid_until) {
      return { type: 'danger', msg: 'Abonnement expiré ou invalide.' };
    }
    const validUntil = new Date(storeData.subscription_valid_until);
    if (validUntil < new Date()) {
      return { type: 'danger', msg: `Expiré depuis le ${validUntil.toLocaleDateString('fr-FR')}` };
    }
    const daysLeft = Math.ceil((validUntil.getTime() - Date.now()) / 86400000);
    if (daysLeft <= 3) {
      return { type: 'warning', msg: `Expire bientôt (dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''})` };
    }
    return { type: 'success', msg: `Actif jusqu'au ${validUntil.toLocaleDateString('fr-FR')}` };
  };

  const status = getStatus();

  const handlePaymentSuccess = (planId: string, newValidUntil: Date) => {
    refreshStoreData();
    fetchPayments();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-12">
      <header className="flex justify-between items-end border-b border-art-border pb-6">
        <h1 className="text-4xl font-serif italic tracking-tight text-art-text">Abonnement</h1>
      </header>

      {/* Status Card */}
      <div className={`p-6 border flex flex-col md:flex-row items-center gap-6 justify-between ${
        status.type === 'success' ? 'glass border-green-200' :
        status.type === 'warning' ? 'glass border-yellow-200' :
        'bg-red-50/50 border-red-200'
      }`}>
        <div className="flex items-center gap-4">
          {status.type === 'success'
            ? <CheckCircle2 className="w-8 h-8 text-green-500" />
            : <AlertCircle className={`w-8 h-8 ${status.type === 'warning' ? 'text-yellow-500' : 'text-red-500'}`} />
          }
          <div>
            <h2 className="text-xl font-bold tracking-tight mb-1">
              Forfait {
                storeData?.subscription_plan === 'pro' ? 'Pro' :
                storeData?.subscription_plan === 'essential' ? 'Essentiel' :
                'Gratuit (Démo)'
              }
            </h2>
            <p className={`text-sm font-mono ${status.type === 'danger' ? 'text-red-700' : 'text-art-muted'}`}>
              {status.msg}
            </p>
          </div>
        </div>
      </div>

      {/* Plans List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {PLANS.map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrentPlan={storeData?.subscription_plan === plan.id}
            user={user}
            storeName={storeData?.store_name || ''}
            onSuccess={handlePaymentSuccess}
          />
        ))}
      </div>

      {/* Payment History and Reconciliation Section */}
      <div className="border-t border-art-border pt-10">
        <div className="flex items-center gap-2 mb-6">
          <History className="w-5 h-5 text-art-text" />
          <h2 className="text-2xl font-serif italic text-art-text">Historique des transactions</h2>
        </div>

        {loadingPayments ? (
          <div className="flex items-center gap-2 text-xs font-mono text-art-muted">
            <Loader2 className="w-4 h-4 animate-spin" />
            Chargement de l'historique...
          </div>
        ) : payments.length === 0 ? (
          <p className="text-xs font-mono text-art-muted uppercase tracking-widest">Aucune transaction trouvée.</p>
        ) : (
          <div className="glass-surface border border-art-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-art-border bg-art-text/5 text-art-text uppercase font-bold tracking-widest text-[10px]">
                    <th className="p-4">Date</th>
                    <th className="p-4">Référence (TxRef)</th>
                    <th className="p-4">Forfait</th>
                    <th className="p-4">Montant</th>
                    <th className="p-4">Statut</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-art-border/50">
                  {payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-art-text/5 transition-colors">
                      <td className="p-4 whitespace-nowrap text-art-muted">
                        {new Date(payment.created_at).toLocaleDateString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="p-4 font-bold">{payment.tx_ref}</td>
                      <td className="p-4 uppercase">
                        {payment.plan_id === 'pro' ? 'Pro' : 'Essentiel'}
                      </td>
                      <td className="p-4 font-bold">
                        {payment.amount.toLocaleString()} {payment.currency || 'XOF'}
                      </td>
                      <td className="p-4">
                        {payment.status === 'success' && (
                          <span className="inline-flex items-center gap-1 text-green-600 font-bold">
                            <Check className="w-3.5 h-3.5" /> Validé
                          </span>
                        )}
                        {payment.status === 'pending_verification' && (
                          <span className="inline-flex items-center gap-1 text-yellow-600 font-bold animate-pulse">
                            <AlertCircle className="w-3.5 h-3.5" /> En attente de validation
                          </span>
                        )}
                        {payment.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 text-art-muted font-bold">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Initié
                          </span>
                        )}
                        {payment.status === 'failed' && (
                          <span className="inline-flex items-center gap-1 text-red-600 font-bold">
                            <XCircle className="w-3.5 h-3.5" /> Échoué
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        {payment.status === 'pending_verification' && (
                          <button
                            onClick={() => handleVerifyPayment(payment)}
                            disabled={verifyingId === payment.id}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-art-text text-white text-[10px] uppercase font-bold tracking-widest active:scale-95 transition-transform disabled:opacity-50"
                          >
                            {verifyingId === payment.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3" />
                            )}
                            Vérifier
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
