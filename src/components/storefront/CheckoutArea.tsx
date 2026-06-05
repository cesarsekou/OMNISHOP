import React, { useState } from 'react';
import { CheckCircle2, ArrowLeft, ShoppingBag, Loader2, Minus, Plus } from 'lucide-react';
import { Product } from '../../types/index';
import { supabase } from '../../lib/supabase';
import { COUNTRIES } from '../../data/countries';
import { cn, formatPhoneForWhatsApp } from '../../lib/utils';

export function CheckoutArea({ 
  storeId, storeWhatsApp, storeDeliveryCost, storeCountry, cart, cartTotal, onBack, onSuccess, onOrderCreated 
}: { 
  storeId: string, 
  storeWhatsApp?: string,
  storeDeliveryCost: number,
  storeCountry?: string,
  cart: { product: Product, quantity: number }[], 
  cartTotal: number, 
  onBack: () => void,
  onSuccess: (track?: boolean) => void,
  onOrderCreated: (orderId: string) => void
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState('');
  const [customCity, setCustomCity] = useState('');
  const [customNeighborhood, setCustomNeighborhood] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ordered, setOrdered] = useState(false);

  const countryCode = storeCountry || 'CI';
  const currentCountryCommunes = COUNTRIES[countryCode]?.communes || {};
  const currency = COUNTRIES[countryCode]?.currency || 'FCFA';

  const deliveryCost = deliveryMethod === 'delivery' ? storeDeliveryCost : 0;
  const finalTotal = cartTotal + deliveryCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const items = cart.map(c => ({
        productId: c.product.id,
        name: c.product.name,
        price: c.product.price,
        quantity: c.quantity
      }));

      const finalCity = deliveryCity === 'Autre' ? customCity : deliveryCity;
      const finalNeighborhood = deliveryNeighborhood === 'Autre' ? customNeighborhood : deliveryNeighborhood;

      // Formater le numéro de téléphone avec l'indicatif pays automatiquement
      const formattedPhone = formatPhoneForWhatsApp(phone, countryCode);

      // Create order document
      // Note: A database trigger (on_order_created_whatsapp) automatically intercepts
      // this insertion and queue a WhatsApp notification in 'whatsapp_queue' if enabled by the merchant.
      const { data: createdOrder, error: orderError } = await supabase.from('orders').insert({
        user_id: storeId,
        customer_name: name,
        customer_phone: formattedPhone,
        customer_address: deliveryMethod === 'delivery' ? `${deliveryAddress}, ${finalNeighborhood}, ${finalCity}` : 'Retrait en magasin',
        items,
        total: finalTotal,
        status: 'pending'
      }).select().single();
      
      if (orderError) throw orderError;

      // Decrement stock for each product atomically via PostgreSQL RPC
      for (const item of cart) {
        if (item.product.id) {
          await supabase.rpc('decrement_stock', { 
            product_id: item.product.id, 
            quantity: item.quantity 
          });
        }
      }

      if (createdOrder) {
        onOrderCreated(createdOrder.id);
      }

      setOrdered(true);
      // We don't automatically close the checkout if WhatsApp is available so they can click the button
      if (!storeWhatsApp) {
        setTimeout(() => {
          onSuccess();
        }, 3000);
      }
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la commande.");
      setSubmitting(false);
    }
  };

  if (ordered) {
    const finalCity = deliveryCity === 'Autre' ? customCity : deliveryCity;
    const finalNeighborhood = deliveryNeighborhood === 'Autre' ? customNeighborhood : deliveryNeighborhood;

    const textMessage = `*Nouvelle Commande*\n\n*Client:* ${name}\n*Tél:* ${phone}\n*Livraison:* ${deliveryMethod === 'delivery' ? finalCity + ' - ' + finalNeighborhood : 'Retrait'}\n\n*Articles:*\n${cart.map(c => `- ${c.quantity}x ${c.product.name} (${(c.product.price * c.quantity).toFixed(0)} ${currency})`).join('\n')}\n\n*Total: ${finalTotal.toFixed(0)} ${currency}*`;
    const waLink = storeWhatsApp ? `https://wa.me/${storeWhatsApp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(textMessage)}` : '';

    return (
      <div className="p-8 flex flex-col items-center justify-center h-full text-center mt-12 glass-surface m-6 border border-art-border relative">
        <div className="absolute -top-3 -right-3 w-6 h-6 border-t-2 border-r-2 border-art-text" />
        <div className="absolute -bottom-3 -left-3 w-6 h-6 border-b-2 border-l-2 border-art-text" />
        
        <CheckCircle2 className="w-16 h-16 text-art-accent mb-6" />
        <h2 className="text-3xl font-serif italic text-art-text mb-4">Commande Validée.</h2>
        <p className="text-sm font-mono text-art-muted mb-8">Le vendeur prendra contact avec vous très prochainement.</p>

        {storeWhatsApp ? (
          <div className="flex flex-col gap-3 w-full">
            <a 
              href={waLink}
              target="_blank" 
              rel="noopener noreferrer"
              className="w-full bg-[#25D366] text-white py-4 font-bold text-xs uppercase tracking-widest shadow-[4px_4px_0px_rgba(0,0,0,0.1)] active:scale-[0.99] transition-transform hover:translate-y-px flex items-center justify-center gap-2 hover:bg-[#20ba5a]"
            >
              Envoyer ma commande sur WhatsApp
            </a>
            
            <button 
              onClick={() => onSuccess(true)}
              className="w-full bg-art-text text-white py-4 font-bold text-xs uppercase tracking-widest shadow-[4px_4px_0px_rgba(0,0,0,0.1)] active:scale-[0.99] transition-transform hover:translate-y-px flex items-center justify-center gap-2"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              Suivre ma commande en direct
            </button>

            <button onClick={() => onSuccess(false)} className="text-xs uppercase font-bold tracking-widest text-art-muted hover:text-art-text transition-colors mt-4 border-b border-transparent hover:border-art-text w-fit mx-auto pb-1">
              Retourner à la boutique
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 w-full">
            <button 
              onClick={() => onSuccess(true)}
              className="w-full bg-art-text text-white py-4 font-bold text-xs uppercase tracking-widest shadow-[4px_4px_0px_rgba(0,0,0,0.1)] active:scale-[0.99] transition-transform hover:translate-y-px flex items-center justify-center gap-2"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              Suivre ma commande en direct
            </button>

            <button onClick={() => onSuccess(false)} className="text-xs uppercase font-bold tracking-widest text-art-muted hover:text-art-text transition-colors mt-4 border-b border-transparent hover:border-art-text w-fit mx-auto pb-1">
              Retourner à la boutique
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6">
      <button onClick={onBack} className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-art-muted mb-8 hover:text-art-text transition-colors">
        <ArrowLeft className="w-3 h-3" />
        Retour
      </button>

      <h2 className="text-2xl font-serif italic text-art-text mb-6">Récapitulatif</h2>
      <div className="glass-surface border border-art-border p-5 mb-10 space-y-4">
        {cart.map((item, idx) => (
          <div key={idx} className="flex gap-4 border-b border-art-border/50 pb-4 last:border-0 last:pb-0">
            <div className="w-16 h-16 glass border border-art-border flex-shrink-0 flex items-center justify-center overflow-hidden">
              {item.product.imageUrl ? (
                <img src={item.product.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <ShoppingBag className="w-6 h-6 text-art-muted/50" />
              )}
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <span className="font-bold text-sm tracking-tight">{item.product.name}</span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-art-muted mt-1">Qté: {item.quantity}</span>
            </div>
            <div className="flex flex-col justify-center text-right font-mono">
               <span className="font-bold text-sm mb-1">{(item.product.price * item.quantity).toFixed(0)} {currency}</span>
               <span className="text-[10px] text-art-muted">{item.product.price.toFixed(0)} {currency} / u</span>
            </div>
          </div>
        ))}
        <div className="pt-2 flex justify-between font-bold text-art-text text-sm font-serif italic border-t border-art-border mt-4">
          <span>Sous-total</span>
          <span>{cartTotal.toFixed(0)} {currency}</span>
        </div>
        {deliveryMethod === 'delivery' && (
          <div className="flex justify-between font-bold text-art-text text-sm font-serif italic text-art-muted py-1">
            <span>Frais de livraison</span>
            <span>{deliveryCost.toFixed(0)} {currency}</span>
          </div>
        )}
        <div className="pt-2 flex justify-between font-bold text-art-text text-lg font-serif italic border-t border-art-border">
          <span>Total</span>
          <span className="text-art-accent">{finalTotal.toFixed(0)} {currency}</span>
        </div>
      </div>

      <h2 className="text-2xl font-serif italic text-art-text mb-6">Livraison & Coordonnées</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-3">Mode de réception</label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setDeliveryMethod('pickup')}
              className={`p-3 border text-sm font-medium flex flex-col items-center justify-center transition-colors ${deliveryMethod === 'pickup' ? 'border-art-text glass-surface' : 'border-art-border hover:border-art-text/50'}`}
            >
              <span>Retrait en magasin</span>
              <span className="text-xs text-art-muted mt-1 font-mono italic font-serif">Gratuit</span>
            </button>
            <button
              type="button"
              onClick={() => setDeliveryMethod('delivery')}
              className={`p-3 border text-sm font-medium flex flex-col items-center justify-center transition-colors ${deliveryMethod === 'delivery' ? 'border-art-text glass-surface' : 'border-art-border hover:border-art-text/50'}`}
            >
              <span>Livraison à domicile</span>
              <span className="text-xs text-art-muted mt-1 font-mono italic font-serif">{storeDeliveryCost} {currency}</span>
            </button>
          </div>
        </div>

        {deliveryMethod === 'delivery' && (
          <div className="space-y-6 glass-surface p-4 border border-art-border">
            <div>
              <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">Ville / Commune *</label>
              <select
                required={deliveryMethod === 'delivery'}
                value={deliveryCity}
                onChange={e => {
                  setDeliveryCity(e.target.value);
                  setDeliveryNeighborhood(''); // reset neighborhood when city changes
                }}
                className="w-full glass border border-art-border p-3 focus:outline-none focus:border-art-text text-sm transition-colors bg-art-bg text-art-text"
              >
                <option value="">Sélectionnez votre commune</option>
                {Object.keys(currentCountryCommunes).map(commune => (
                  <option key={commune} value={commune}>{commune}</option>
                ))}
                <option value="Autre">Autre (Saisir manuellement)</option>
              </select>
              {deliveryCity === 'Autre' && (
                <input
                  required
                  value={customCity}
                  onChange={e => setCustomCity(e.target.value)}
                  type="text"
                  className="w-full glass border border-art-border p-3 focus:outline-none focus:border-art-text text-sm transition-colors mt-2"
                  placeholder="Saisissez le nom de votre ville ou commune"
                />
              )}
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">Quartier / Repère *</label>
              {deliveryCity && deliveryCity !== 'Autre' ? (
                <>
                  <select
                    required={deliveryMethod === 'delivery'}
                    value={deliveryNeighborhood}
                    onChange={e => setDeliveryNeighborhood(e.target.value)}
                    className="w-full glass border border-art-border p-3 focus:outline-none focus:border-art-text text-sm transition-colors bg-art-bg text-art-text"
                  >
                    <option value="">Sélectionnez votre quartier</option>
                    {(currentCountryCommunes[deliveryCity] || []).map(q => (
                      <option key={q} value={q}>{q}</option>
                    ))}
                    <option value="Autre">Autre (Saisir manuellement)</option>
                  </select>
                  {deliveryNeighborhood === 'Autre' && (
                    <input
                      required
                      value={customNeighborhood}
                      onChange={e => setCustomNeighborhood(e.target.value)}
                      type="text"
                      className="w-full glass border border-art-border p-3 focus:outline-none focus:border-art-text text-sm transition-colors mt-2"
                      placeholder="Saisissez le nom de votre quartier"
                    />
                  )}
                </>
              ) : (
                <input
                  required={deliveryMethod === 'delivery'}
                  value={deliveryNeighborhood}
                  onChange={e => setDeliveryNeighborhood(e.target.value)}
                  type="text"
                  className="w-full glass border border-art-border p-3 focus:outline-none focus:border-art-text text-sm transition-colors"
                  placeholder="Ex: Angré 8ème tranche, près de la pharmacie"
                />
              )}
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">Adresse détaillée <span className="font-normal italic font-serif lowercase text-xs">(optionnel)</span></label>
              <input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} type="text" className="w-full glass border border-art-border p-3 focus:outline-none focus:border-art-text text-sm transition-colors" placeholder="N° de rue, porte, etc. (Plus de précision)" />
            </div>
          </div>
        )}

        <div className="border-t border-art-border pt-6">
          <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">Nom complet *</label>
          <input required autoFocus value={name} onChange={e => setName(e.target.value)} type="text" className="w-full glass-surface border border-art-border p-3 focus:outline-none focus:border-art-text text-sm transition-colors" />
        </div>
        <div>
          <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">Téléphone *</label>
          <input required value={phone} onChange={e => setPhone(e.target.value)} type="tel" className="w-full glass-surface border border-art-border p-3 focus:outline-none focus:border-art-text text-sm transition-colors font-mono" placeholder="+33 6 00 00 00 00" />
        </div>
        <div>
          <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">Email <span className="font-normal italic font-serif lowercase text-xs">(optionnel)</span></label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" className="w-full glass-surface border border-art-border p-3 focus:outline-none focus:border-art-text text-sm transition-colors" />
        </div>
        
        <button disabled={submitting} type="submit" className="w-full flex items-center justify-center gap-2 bg-art-text text-white py-4 mt-12 font-bold text-xs uppercase tracking-widest active:scale-[0.99] transition-transform shadow-[4px_4px_0px_rgba(0,0,0,0.1)] hover:translate-y-px hover:shadow-[2px_2px_0px_rgba(0,0,0,0.1)]">
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirmer l'achat"}
        </button>
      </form>
    </div>
  );
}
