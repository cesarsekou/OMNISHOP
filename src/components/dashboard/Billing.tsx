import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
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
  onPayInit: (planId: string) => Promise<void>;
}

const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  isCurrentPlan,
  onPayInit,
}) => {
  const [processing, setProcessing] = useState(false);

  const handlePay = async () => {
    setProcessing(true);
    try {
      await onPayInit(plan.id);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erreur lors de la redirection vers Stripe.');
    } finally {
      setProcessing(false);
    }
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
          <span className="text-xs text-art-muted font-mono">FCFA / mois</span>
        </div>
        <p className="text-xs text-art-muted uppercase tracking-widest leading-relaxed">{plan.description}</p>
      </div>
      <div className="mt-auto pt-6 border-t border-art-border">
        <button
          onClick={handlePay}
          disabled={processing}
          className="w-full flex items-center justify-center gap-2 bg-art-text text-white py-4 font-bold text-xs uppercase tracking-widest active:scale-[0.99] transition-transform shadow-[4px_4px_0px_rgba(0,0,0,0.1)] hover:translate-y-px hover:shadow-[2px_2px_0px_rgba(0,0,0,0.1)] disabled:opacity-50 cursor-pointer"
        >
          {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-4 h-4" />}
          {isCurrentPlan ? 'Renouveler ce forfait' : 'Passer à ce forfait'}
        </button>
        <p className="text-center text-[10px] text-art-muted mt-3 font-mono">
          Paiement sécurisé par Stripe (Abonnement par Carte)
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
  const [verifying, setVerifying] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

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

  // Handle returns from Stripe Checkout
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const statusParam = searchParams.get('status');

    if (sessionId) {
      verifyStripePayment(sessionId);
    } else if (statusParam === 'cancelled') {
      toast.error("Le paiement a été annulé.");
      // Clean up URL
      searchParams.delete('status');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]);

  const verifyStripePayment = async (sessionId: string) => {
    setVerifying(true);
    const toastId = toast.loading('Vérification du paiement Stripe...');

    try {
      let verifyUrl = '/api/verify-stripe-payment';
      if (window.location.hostname === 'localhost') {
        verifyUrl = 'http://localhost:3000/api/verify-stripe-payment';
      }

      const res = await fetch(verifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ session_id: sessionId })
      });

      const result = await res.json();
      
      if (res.ok && result.success) {
        toast.success("Félicitations ! Votre forfait est activé.", { id: toastId });
        await refreshStoreData();
        await fetchPayments();
      } else {
        throw new Error(result.message || 'La validation Stripe a échoué');
      }
    } catch (err: any) {
      console.error("Erreur validation Stripe:", err);
      toast.error(err.message || 'Erreur lors du traitement de votre abonnement.', { id: toastId });
    } finally {
      setVerifying(false);
      // Clean up query parameters from URL
      searchParams.delete('session_id');
      setSearchParams(searchParams, { replace: true });
    }
  };

  const handlePayInit = async (planId: string) => {
    let sessionUrl = '/api/create-checkout-session';
    if (window.location.hostname === 'localhost') {
      sessionUrl = 'http://localhost:3000/api/create-checkout-session';
    }

    const response = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        planId,
        userId: user.id,
        userEmail: user.email,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Impossible de créer la session Stripe Checkout.');
    }

    // Redirect to Stripe Checkout page
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error('URL Stripe Checkout invalide.');
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

  return (
    <div className="max-w-5xl mx-auto space-y-12">
      <header className="flex justify-between items-end border-b border-art-border pb-6">
        <h1 className="text-4xl font-serif italic tracking-tight text-art-text">Abonnement</h1>
      </header>

      {/* Verification Loader Overlay */}
      {verifying && (
        <div className="p-6 border bg-art-accent/10 border-art-accent animate-pulse flex items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-art-accent" />
          <span className="text-sm font-mono uppercase tracking-widest font-bold text-art-text">
            Finalisation de l'abonnement en cours...
          </span>
        </div>
      )}

      {/* Status Card */}
      {!verifying && (
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
      )}

      {/* Plans List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {PLANS.map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrentPlan={storeData?.subscription_plan === plan.id}
            user={user}
            onPayInit={handlePayInit}
          />
        ))}
      </div>

      {/* Payment History Section */}
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
                    <th className="p-4">Référence / Session ID</th>
                    <th className="p-4">Forfait</th>
                    <th className="p-4">Montant</th>
                    <th className="p-4">Statut</th>
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
                      <td className="p-4 font-bold select-all truncate max-w-[200px]" title={payment.tx_ref}>
                        {payment.tx_ref}
                      </td>
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
                          <span className="inline-flex items-center gap-1 text-yellow-600 font-bold">
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
