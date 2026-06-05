import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Store, ShoppingBag, Plus, Minus, Info, CheckCircle2, Loader2, ArrowLeft, Check, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { Product, StoreData } from '../types/index';
import { Helmet } from 'react-helmet-async';
import { COUNTRIES } from '../data/countries';
import { Product3DShowcase } from '../components/storefront/Product3DShowcase';
import { ProductDetailsModal } from '../components/storefront/ProductDetailsModal';
import { CheckoutArea } from '../components/storefront/CheckoutArea';
import { OrderTracking } from '../components/storefront/OrderTracking';

function isDarkColor(hex?: string) {
  if (!hex) return false;
  const c = hex.replace('#', '');
  if (c.length === 3) {
    const r = parseInt(c[0] + c[0], 16);
    const g = parseInt(c[1] + c[1], 16);
    const b = parseInt(c[2] + c[2], 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  }
  if (c.length === 6) {
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  }
  return false;
}

export default function Storefront() {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const [store, setStore] = useState<StoreData | null>(null);
  const currency = store ? (COUNTRIES[store.country || 'CI']?.currency || 'FCFA') : 'FCFA';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Cart
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>(() => {
    const saved = localStorage.getItem(`omnishop_cart_${storeSlug}`);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return []; }
    }
    return [];
  });
  const [isCheckout, setIsCheckout] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCartBouncing, setIsCartBouncing] = useState(false);
  const [flyingItems, setFlyingItems] = useState<{ id: number; x: number; y: number; tx: number; ty: number; imageUrl?: string }[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("Tout");
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [showTracking, setShowTracking] = useState(false);

  useEffect(() => {
    if (storeSlug) {
      localStorage.setItem(`omnishop_cart_${storeSlug}`, JSON.stringify(cart));
    }
  }, [cart, storeSlug]);

  const handleAddToCartWithAnimation = (product: Product, e: React.MouseEvent<HTMLButtonElement>) => {
    const existing = cart.find(item => item.product.id === product.id);
    const qtyInCart = existing ? existing.quantity : 0;
    if (product.stock !== undefined && qtyInCart >= product.stock) {
      return;
    }

    addToCart(product);

    // Calculate dynamic trajectory from click source to centered floating cart bar
    const startX = e.clientX;
    const startY = e.clientY;
    const targetX = window.innerWidth / 2;
    const targetY = window.innerHeight - 80;

    const id = Date.now() + Math.random();
    const tx = targetX - startX;
    const ty = targetY - startY;

    setFlyingItems(prev => [...prev, {
      id,
      x: startX,
      y: startY,
      tx,
      ty,
      imageUrl: product.imageUrl
    }]);

    // Haptic-style pulse feedback when orb hits bottom cart bar
    setTimeout(() => {
      setIsCartBouncing(true);
      setTimeout(() => setIsCartBouncing(false), 300);
    }, 800);

    // Dynamic cleanup of flying elements
    setTimeout(() => {
      setFlyingItems(prev => prev.filter(item => item.id !== id));
    }, 1000);
  };

  useEffect(() => {
    const fetchStore = async () => {
      if (!storeSlug) return;
      try {
        const { data: storeDoc, error: storeError } = await supabase
          .from('users')
          .select('*')
          .eq('store_url', storeSlug)
          .single();
        
        if (storeError || !storeDoc) {
          setError('Boutique introuvable');
          setLoading(false);
          return;
        }

        setStore(storeDoc as StoreData);

        // Load active order id from URL query parameters or localStorage if present
        const params = new URLSearchParams(window.location.search);
        const urlOrderId = params.get('order');

        if (urlOrderId) {
          setActiveOrderId(urlOrderId);
          setShowTracking(true);
        } else {
          const savedOrderId = localStorage.getItem(`activeOrderId_${storeDoc.id}`);
          if (savedOrderId) {
            setActiveOrderId(savedOrderId);
          }
        }

        // Fetch products
        const { data: pData, error: pError } = await supabase
          .from('products')
          .select('*')
          .eq('user_id', storeDoc.id);
          
        if (pData) {
          const mappedProducts = pData.map(d => ({
            id: d.id,
            name: d.name,
            price: Number(d.price),
            description: d.description,
            imageUrl: d.image,
            category: d.category,
            stock: d.stock_count,
            createdAt: d.created_at,
          }));
          setProducts(mappedProducts);

          // Deep linking to product details modal
          const urlParams = new URLSearchParams(window.location.search);
          const productIdParam = urlParams.get('p');
          if (productIdParam) {
            const matchedProduct = mappedProducts.find(p => p.id === productIdParam);
            if (matchedProduct) {
              setSelectedProduct(matchedProduct);
            }
          }
        }
        
      } catch (err) {
        console.error(err);
        setError("Erreur lors du chargement de la boutique");
      }
      setLoading(false);
    };
    fetchStore();
  }, [storeSlug]);

  // Theme: apply store CSS custom properties — must be before any conditional return
  useEffect(() => {
    if (!store) return;
    if (store.theme_color) document.documentElement.style.setProperty('--color-art-accent', store.theme_color);
    if (store.background_color) document.documentElement.style.setProperty('--color-art-bg', store.background_color);
    if (store.text_color) document.documentElement.style.setProperty('--color-art-text', store.text_color);
    
    // Check if background is dark to apply high-fidelity dark glassmorphism variables
    const isDark = isDarkColor(store.background_color);
    if (isDark) {
      document.documentElement.style.setProperty('--color-glass-bg', 'rgba(19, 19, 19, 0.7)');
      document.documentElement.style.setProperty('--color-glass-border', 'rgba(255, 255, 255, 0.08)');
      document.documentElement.style.setProperty('--color-glass-surface', 'rgba(255, 255, 255, 0.04)');
      document.documentElement.style.setProperty('--color-glass-shadow', 'rgba(0, 0, 0, 0.3)');
      document.documentElement.style.setProperty('--color-art-border', 'rgba(255, 255, 255, 0.08)');
      document.documentElement.style.setProperty('--color-art-muted', '#A1A1AA');
      document.documentElement.style.setProperty('--font-serif', '"Manrope", var(--font-sans)');
    } else {
      document.documentElement.style.setProperty('--color-glass-bg', 'rgba(255, 255, 255, 0.45)');
      document.documentElement.style.setProperty('--color-glass-border', 'rgba(0, 0, 0, 0.06)');
      document.documentElement.style.setProperty('--color-glass-surface', 'rgba(0, 0, 0, 0.02)');
      document.documentElement.style.setProperty('--color-glass-shadow', 'rgba(31, 38, 135, 0.03)');
      document.documentElement.style.setProperty('--color-art-border', 'rgba(229, 226, 217, 0.4)');
      document.documentElement.style.setProperty('--color-art-muted', '#8A8471');
      document.documentElement.style.setProperty('--font-serif', '"Playfair Display", ui-serif, Georgia, serif');
    }

    return () => {
      document.documentElement.style.removeProperty('--color-art-accent');
      document.documentElement.style.removeProperty('--color-art-bg');
      document.documentElement.style.removeProperty('--color-art-text');
      document.documentElement.style.removeProperty('--color-glass-bg');
      document.documentElement.style.removeProperty('--color-glass-border');
      document.documentElement.style.removeProperty('--color-glass-surface');
      document.documentElement.style.removeProperty('--color-glass-shadow');
      document.documentElement.style.removeProperty('--color-art-border');
      document.documentElement.style.removeProperty('--color-art-muted');
      document.documentElement.style.removeProperty('--font-serif');
    };
  }, [store]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      const currentQty = existing ? existing.quantity : 0;
      if (product.stock !== undefined && currentQty >= product.stock) {
        toast.error("Stock maximum atteint");
        return prev;
      }
      if (existing) {
        return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === productId);
      if (existing && existing.quantity > 1) {
        return prev.map(item => item.product.id === productId ? { ...item, quantity: item.quantity - 1 } : item);
      }
      return prev.filter(item => item.product.id !== productId);
    });
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const categoriesList = store?.categories || [];
  const hasAnyCategory = products.some(p => p.category);

  const grouped = products.reduce((acc, p) => {
    const cat = p.category || (hasAnyCategory ? 'Autres' : 'Tous les produits');
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {} as Record<string, any[]>);

  const orderedCategories = [...categoriesList];
  Object.keys(grouped).forEach(cat => {
    if (!orderedCategories.includes(cat) && cat !== 'Autres' && cat !== 'Tous les produits') {
      orderedCategories.push(cat);
    }
  });
  if (grouped['Autres']) orderedCategories.push('Autres');
  if (grouped['Tous les produits']) orderedCategories.push('Tous les produits');

  const renderProducts = () => {
    const filteredCategories = selectedCategory === "Tout"
      ? orderedCategories
      : orderedCategories.filter(cat => cat === selectedCategory);

    return filteredCategories.map(categoryName => {
      const categoryProducts = grouped[categoryName];
      if (!categoryProducts || categoryProducts.length === 0) return null;

      return (
        <div key={categoryName} className="mb-12 last:mb-0">
          <h2 className="text-xl font-serif italic text-art-text mb-6 border-b border-art-border pb-2 animate-reveal-up">{categoryName}</h2>
          <div className="grid grid-cols-2 gap-4">
            {categoryProducts.map((product, pIdx) => {
              const cartItem = cart.find(c => c.product.id === product.id);
              const qty = cartItem ? cartItem.quantity : 0;
              return (
                <div 
                  key={product.id} 
                  className="flex flex-col gap-3 p-3 border border-art-border glass group shadow-sm animate-stagger-fade h-full"
                  style={{ animationDelay: `${pIdx * 0.08}s` }}
                >
                  <div 
                    onClick={() => setSelectedProduct(product)}
                    className="w-full aspect-square glass-surface overflow-hidden flex items-center justify-center relative rounded-sm cursor-zoom-in group"
                  >
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <ShoppingBag className="w-6 h-6 text-art-muted/50" />
                    )}
                    <div className="absolute top-0 left-0 glass border-b border-r border-art-border px-2 py-0.5 font-serif font-bold text-xs z-10">
                      {product.price.toFixed(0)} F
                    </div>
                    {/* Visual hint on hover */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 flex items-center justify-center transition-all duration-300 pointer-events-none opacity-0 group-hover:opacity-100 z-10">
                      <span className="text-[9px] text-white uppercase font-bold tracking-widest bg-black/60 px-2.5 py-1.5 border border-white/25 rounded-full flex items-center gap-1.5 backdrop-blur-xs scale-90 group-hover:scale-100 transition-all duration-300">
                        🔍 Voir en 3D
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col justify-between">
                    <div className="mb-2">
                      <h3 className="font-bold text-art-text text-sm leading-tight line-clamp-1">{product.name}</h3>
                      {product.stock > 0 && product.stock <= 3 && (
                        <div className="text-[8px] font-bold text-red-500 tracking-wider uppercase animate-pulse mt-0.5 flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-red-500 inline-block animate-ping" />
                          🔥 Plus que {product.stock} exemplaires restants !
                        </div>
                      )}
                      {product.description && <p className="text-[10px] text-art-muted line-clamp-2 mt-1 italic font-serif leading-relaxed">{product.description}</p>}
                    </div>
                    <div className="mt-auto pt-2 border-t border-art-border/50">
                      {product.stock <= 0 ? (
                        <div className="w-full text-[9px] uppercase font-bold tracking-wider text-red-500 border border-red-200 bg-red-50 py-2 text-center">
                          Rupture
                        </div>
                      ) : qty > 0 ? (
                        <div className="flex items-center text-[10px] font-mono font-bold w-full justify-between border border-art-text px-1 py-0.5 glass-surface">
                          <button onClick={() => removeFromCart(product.id)} className="w-6 h-6 flex items-center justify-center text-art-text hover:glass border border-transparent hover:border-art-border transition-colors"><Minus className="w-3 h-3" /></button>
                          <span className="w-6 text-center">{qty}</span>
                          <button onClick={(e) => handleAddToCartWithAnimation(product, e)} disabled={qty >= product.stock} className="w-6 h-6 flex items-center justify-center text-art-text hover:glass border border-transparent hover:border-art-border transition-colors disabled:opacity-30"><Plus className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <button onClick={(e) => handleAddToCartWithAnimation(product, e)} className="w-full text-[9px] uppercase font-bold tracking-widest text-art-text border border-art-text py-2 hover:bg-art-text hover:text-white transition-all hover:tracking-wider active:scale-[0.98] duration-300">Ajouter</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    });
  };

  if (loading) return <div className="h-screen bg-art-bg flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-art-text" /></div>;
  if (!store || error) return <div className="h-screen bg-art-bg flex items-center justify-center text-art-muted flex-col gap-4 font-serif italic"><Info className="w-12 h-12" /><p>{error || "Boutique introuvable"}</p></div>;

  return (
    <>
      <Helmet>
        <title>{store.store_name} | OmniShop</title>
        <meta name="description" content={`Découvrez ${store.store_name} et commandez en ligne facilement. Livraison rapide et paiement sécurisé.`} />
        <meta property="og:title" content={store.store_name} />
        <meta property="og:description" content={`Découvrez ${store.store_name} et commandez en ligne facilement.`} />
        <meta property="og:type" content="website" />
        {/* Dynamic theme color for mobile browsers */}
        <meta name="theme-color" content={store.theme_color || '#FDFCF8'} />
      </Helmet>
      <style>{`
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      <div className="min-h-screen font-sans text-art-text flex justify-center relative overflow-hidden bg-transparent">
      {/* Decorative Background */}
      <div className="absolute top-0 right-0 w-1/3 h-full glass-surface -z-10 skew-x-[-12deg] translate-x-32" style={store?.background_color ? { backgroundColor: `${store.background_color}e6` } : undefined} />

      <div className="w-full max-w-md glass border-x border-white/30 min-h-screen relative flex flex-col shadow-2xl">
        
        {/* Floating Cart Icon */}
        {!isCheckout && (
          <button
            onClick={() => setIsCartOpen(true)}
            className={cn(
              "absolute top-6 right-6 z-30 bg-art-bg/90 border border-art-border/60 hover:border-art-text text-art-text backdrop-blur-md shadow-lg active:scale-95 transition-all duration-300 flex items-center justify-center w-12 h-12 rounded-full",
              isCartBouncing ? "animate-bounce" : ""
            )}
            aria-label="Voir le panier"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="bg-art-text text-white text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center border border-art-bg absolute -top-1 -right-1 animate-scale-in">
                {cartCount}
              </span>
            )}
          </button>
        )}

        {/* Header */}
        <header 
          className={cn(
            "px-8 py-10 border-b z-10 sticky top-0 transition-shadow relative overflow-hidden flex flex-col items-center justify-center min-h-[140px]",
            store.hero_image ? "text-white border-white/10" : "border-art-border glass text-art-text"
          )}
          style={store.hero_image ? {
            backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(0,0,0,0.6)), url(${store.hero_image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          } : undefined}
        >
          {store.hero_image && (
            <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px] pointer-events-none" />
          )}
          <div className="flex flex-col items-center justify-center relative z-10 w-full">
            <div className="overflow-hidden py-1 w-full flex justify-center">
              <h1 className={cn(
                "text-3xl font-serif italic tracking-tight text-center leading-tight mb-2 animate-reveal-up",
                store.hero_image ? "text-white drop-shadow-md" : "text-art-text"
              )}>{store.store_name}</h1>
            </div>
            {!isCheckout && (
              <div className="overflow-hidden py-0.5 mt-1">
                <p 
                  className={cn(
                    "text-center text-[10px] uppercase font-bold tracking-widest glass-surface px-4 py-1 border animate-reveal-up",
                    store.hero_image ? "text-white/90 border-white/20 bg-white/10" : "text-art-muted border-art-border"
                  )}
                  style={{ animationDelay: '0.25s' }}
                >
                  Boutique Officielle
                </p>
              </div>
            )}
          </div>
        </header>

        {/* Dynamic Area */}
        <main className="flex-1 overflow-y-auto pb-32">
          {showTracking && activeOrderId ? (
            <OrderTracking
              orderId={activeOrderId}
              storeWhatsApp={store.whatsapp_number}
              currency={currency}
              onClose={() => setShowTracking(false)}
              onClearTracking={() => {
                setActiveOrderId(null);
                localStorage.removeItem(`activeOrderId_${store.id}`);
              }}
            />
          ) : isCheckout ? (
            <CheckoutArea 
              storeId={store.id} 
              storeWhatsApp={store.whatsapp_number}
              storeDeliveryCost={store.delivery_cost ?? 1000}
              storeCountry={store.country}
              cart={cart} 
              cartTotal={cartTotal} 
              onBack={() => setIsCheckout(false)} 
              onSuccess={(track) => { 
                setCart([]); 
                setIsCheckout(false); 
                if (track) {
                  setShowTracking(true);
                }
              }}
              onOrderCreated={(orderId) => {
                setActiveOrderId(orderId);
                localStorage.setItem(`activeOrderId_${store.id}`, orderId);
              }}
            />
          ) : (
            <div className="flex flex-col">
              {/* Horizontal Category Navigation Bar */}
              {products.length > 0 && orderedCategories.length > 0 && (
                <div className="sticky top-0 bg-art-bg/95 backdrop-blur-md z-20 border-b border-art-border/40 py-4 flex gap-6 overflow-x-auto scrollbar-none whitespace-nowrap px-6 items-center">
                  <button
                    onClick={() => setSelectedCategory("Tout")}
                    className={cn(
                      "transition-all duration-300 pb-1.5 focus:outline-none border-b-2 text-xs",
                      selectedCategory === "Tout"
                        ? "font-serif italic text-art-text border-art-text font-semibold scale-105"
                        : "font-sans text-[9px] uppercase tracking-widest text-art-muted border-transparent hover:text-art-text"
                    )}
                  >
                    Tout
                  </button>
                  {orderedCategories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={cn(
                        "transition-all duration-300 pb-1.5 focus:outline-none border-b-2 text-xs",
                        selectedCategory === cat
                          ? "font-serif italic text-art-text border-art-text font-semibold scale-105"
                          : "font-sans text-[9px] uppercase tracking-widest text-art-muted border-transparent hover:text-art-text"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              <div className="p-6">
                {products.length === 0 ? (
                  <div className="text-center py-12 text-art-muted font-serif italic">Aucun produit disponible.</div>
                ) : (
                  renderProducts()
                )}
              </div>
            </div>
          )}
        </main>

        {/* Real-time Order Tracking Notification Bar */}
        {activeOrderId && !isCheckout && !showTracking && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-[360px] glass border border-art-border/80 p-4 shadow-2xl flex items-center justify-between rounded-xl animate-reveal-up bg-art-bg/95 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
              </span>
              <div>
                <p className="text-[9px] uppercase font-bold tracking-widest text-art-muted font-sans">Suivi en direct</p>
                <p className="text-xs font-semibold text-art-text mt-0.5 font-serif italic">Commande active</p>
              </div>
            </div>
            <button
              onClick={() => setShowTracking(true)}
              className="bg-art-text text-white text-[9px] uppercase font-bold tracking-widest px-4 py-2 hover:bg-art-text/90 transition-colors shadow-md rounded-md"
            >
              Suivre
            </button>
          </div>
        )}

        {/* Footer Checkout Bar */}
        {!isCheckout && cartCount > 0 && (
          <div className={cn(
            "absolute bottom-0 w-full p-6 glass border-t border-art-border z-20 transition-all duration-300 ease-out",
            isCartBouncing ? "scale-[1.03] -translate-y-1 shadow-lg" : ""
          )}>
            <button 
              onClick={() => setIsCartOpen(true)}
              className="w-full flex items-center justify-between bg-art-text text-white py-4 px-6 active:scale-[0.99] transition-all duration-300 shadow-[4px_4px_0px_rgba(0,0,0,0.1)] hover:translate-y-px hover:shadow-[2px_2px_0px_rgba(0,0,0,0.1)]"
            >
              <div className="flex items-center gap-3">
                <div className="border border-white/30 font-mono px-2 py-0.5 text-xs font-bold">{cartCount}</div>
                <span className="text-xs uppercase font-bold tracking-widest">Voir le panier</span>
              </div>
              <span className="font-serif italic text-lg">{cartTotal.toFixed(0)} {currency}</span>
            </button>
          </div>
        )}

        {/* Cart Drawer Overlay */}
        {isCartOpen && (
          <>
            {/* Backdrop Overlay */}
            <div 
              className="absolute inset-0 bg-black/40 backdrop-blur-xs z-30 transition-opacity duration-300 animate-fade-in-backdrop"
              onClick={() => setIsCartOpen(false)}
            />
            
            {/* Drawer Sheet */}
            <div className="absolute bottom-0 left-0 w-full max-h-[82%] bg-art-bg border-t border-art-border z-40 flex flex-col rounded-t-3xl shadow-2xl transition-transform duration-300 animate-slide-up pb-6">
              {/* grabber line */}
              <div className="w-12 h-1 bg-art-muted/30 rounded-full mx-auto my-3" />
              
              {/* Header */}
              <div className="px-6 pb-4 border-b border-art-border flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-serif italic text-art-text">Votre Panier</h2>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-art-muted mt-0.5">{cartCount} {cartCount > 1 ? 'articles' : 'article'}</p>
                </div>
                <button 
                  onClick={() => setIsCartOpen(false)}
                  className="text-xs uppercase font-bold tracking-widest text-art-muted hover:text-art-text transition-colors border border-art-border px-3 py-1.5 glass-surface"
                >
                  Fermer
                </button>
              </div>
              
              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {cart.length === 0 ? (
                  <div className="text-center py-12 text-art-muted font-serif italic">Votre panier est vide.</div>
                ) : (
                  cart.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="flex gap-4 border-b border-art-border/50 pb-4 last:border-0 last:pb-0 items-center animate-stagger-fade"
                      style={{ animationDelay: `${idx * 0.05}s` }}
                    >
                      <div className="w-14 h-14 glass border border-art-border flex-shrink-0 flex items-center justify-center overflow-hidden">
                        {item.product.imageUrl ? (
                           <img src={item.product.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                        ) : (
                          <ShoppingBag className="w-5 h-5 text-art-muted/50" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-sm tracking-tight block truncate">{item.product.name}</span>
                        <span className="font-mono text-xs text-art-muted mt-0.5 block">{item.product.price.toFixed(0)} {currency} / u</span>
                      </div>
                      <div className="flex items-center text-xs font-mono font-bold border border-art-text px-1 py-0.5 glass-surface">
                        <button 
                          onClick={() => removeFromCart(item.product.id)} 
                          className="w-6 h-6 flex items-center justify-center text-art-text hover:glass border border-transparent hover:border-art-border transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center">{item.quantity}</span>
                        <button 
                          onClick={() => addToCart(item.product)} 
                          disabled={item.product.stock !== undefined && item.quantity >= item.product.stock}
                          className="w-6 h-6 flex items-center justify-center text-art-text hover:glass border border-transparent hover:border-art-border transition-colors disabled:opacity-30"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="text-right font-mono font-bold text-sm min-w-[80px]">
                        {(item.product.price * item.quantity).toFixed(0)} {currency}
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {/* Summary and Checkout Button */}
              {cart.length > 0 && (
                <div className="px-6 pt-4 border-t border-art-border bg-art-bg/85 backdrop-blur-md">
                  <div className="flex justify-between font-bold text-art-text text-lg font-serif italic mb-4">
                    <span>Total</span>
                    <span className="text-art-accent">{cartTotal.toFixed(0)} {currency}</span>
                  </div>
                  <button 
                    onClick={() => {
                      setIsCartOpen(false);
                      setIsCheckout(true);
                    }}
                    className="w-full flex items-center justify-center bg-art-text text-white py-4 font-bold text-xs uppercase tracking-widest active:scale-[0.99] transition-transform shadow-[4px_4px_0px_rgba(0,0,0,0.1)] hover:translate-y-px hover:shadow-[2px_2px_0px_rgba(0,0,0,0.1)]"
                  >
                    Passer la commande
                  </button>
                </div>
              )}
            </div>
          </>
        )}

    {/* Inline Styles for Curved Parabolic Fly-To-Cart & Fade Animations */}
    <style>{`
      @keyframes flyX {
        0% { transform: translate3d(calc(var(--startX) - 24px), 0, 0); }
        100% { transform: translate3d(calc(var(--startX) + var(--tx) - 24px), 0, 0); }
      }
      @keyframes flyY {
        0% { transform: translate3d(0, calc(var(--startY) - 24px), 0); }
        100% { transform: translate3d(0, calc(var(--startY) + var(--ty) - 24px), 0); }
      }
      @keyframes scaleDot {
        0% { transform: scale(1); opacity: 1; }
        80% { transform: scale(0.8); opacity: 0.9; }
        100% { transform: scale(0.1); opacity: 0; }
      }
      .flying-dot-wrapper {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 10000;
        pointer-events: none;
        animation: flyX 0.8s cubic-bezier(0.12, 0, 0.39, 0) forwards;
      }
      .flying-dot-inner {
        width: 48px;
        height: 48px;
        border-radius: 9999px;
        background-size: cover;
        background-position: center;
        border: 2px solid white;
        box-shadow: 0 10px 20px rgba(0,0,0,0.15), 0 0 15px var(--color-art-accent);
        animation: flyY 0.8s cubic-bezier(0.25, 1, 0.5, 1) forwards, scaleDot 0.8s linear forwards;
      }
      @keyframes slideUp {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
      }
      .animate-slide-up {
        animation: slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .animate-fade-in {
        animation: fadeIn 0.25s ease-out forwards;
      }
      @keyframes fadeInBackdrop {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .animate-fade-in-backdrop {
        animation: fadeInBackdrop 0.3s ease-out forwards;
      }
    `}</style>

    {/* Render Flying Particle Orbs */}
    {flyingItems.map(item => (
      <div
        key={item.id}
        className="flying-dot-wrapper"
        style={{
          '--startX': `${item.x}px`,
          '--startY': `${item.y}px`,
          '--tx': `${item.tx}px`,
          '--ty': `${item.ty}px`,
        } as React.CSSProperties}
      >
        <div 
          className="flying-dot-inner animate-pulse" 
          style={{ 
            backgroundImage: item.imageUrl ? `url(${item.imageUrl})` : undefined,
            backgroundColor: 'var(--color-art-accent)'
          }}
        />
      </div>
    ))}
        {/* Product 3D showcase detail overlay modal */}
        {selectedProduct && (
          <ProductDetailsModal
            product={selectedProduct}
            currency={currency}
            onClose={() => setSelectedProduct(null)}
            cartQty={cart.find(c => c.product.id === selectedProduct.id)?.quantity || 0}
            stock={selectedProduct.stock}
            themeColor={store.theme_color || '#FF5F1F'}
            onAddToCart={(e) => handleAddToCartWithAnimation(selectedProduct, e)}
            onRemoveFromCart={() => removeFromCart(selectedProduct.id)}
          />
        )}
      </div>
    </div>
    </>
  );
}

