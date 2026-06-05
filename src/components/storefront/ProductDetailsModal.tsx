import React, { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Product } from '../../types/index';
import { cn } from '../../lib/utils';
import { Product3DShowcase } from './Product3DShowcase';

interface ProductDetailsModalProps {
  product: Product;
  currency: string;
  onClose: () => void;
  cartQty: number;
  stock: number;
  themeColor: string;
  onAddToCart: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onRemoveFromCart: () => void;
}

export function ProductDetailsModal({
  product,
  currency,
  onClose,
  cartQty,
  stock,
  themeColor,
  onAddToCart,
  onRemoveFromCart
}: ProductDetailsModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-sm z-30 transition-opacity duration-300",
          mounted ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      
      {/* Centered Modal Content Card */}
      <div 
        className={cn(
          "absolute top-1/2 left-1/2 w-[90%] max-w-sm max-h-[85%] bg-art-bg/95 backdrop-blur-xl border border-art-border z-40 flex flex-col rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden",
          mounted ? "opacity-100 scale-100 -translate-x-1/2 -translate-y-1/2" : "opacity-0 scale-95 -translate-x-1/2 -translate-y-1/2"
        )}
      >
        {/* Header Close button */}
        <div className="px-5 pt-5 pb-2 flex justify-between items-center border-b border-art-border/50">
          <span className="text-[10px] uppercase font-bold tracking-widest text-art-muted bg-current/5 px-2.5 py-0.5 rounded-sm">
            Showcase 3D
          </span>
          <button 
            onClick={onClose}
            className="text-[10px] uppercase font-bold tracking-widest text-art-muted hover:text-art-text transition-colors border border-art-border px-3 py-1.5 glass-surface rounded-md"
          >
            Fermer
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 3D Showcase viewport */}
          <div className="w-full bg-slate-50/30 border border-art-border rounded-xl flex items-center justify-center shadow-inner relative overflow-hidden">
            <div className="absolute top-3 left-3 flex gap-2">
              <span className="text-[9px] font-bold text-white bg-art-text/90 tracking-tight px-2.5 py-0.5 rounded-sm shadow-sm font-mono">
                {product.price.toFixed(0)} {currency}
              </span>
            </div>
            <Product3DShowcase imageUrl={product.imageUrl} name={product.name} />
          </div>

          {/* Product info */}
          <div className="space-y-3">
            <div className="flex flex-col gap-1.5">
              {product.category && (
                <span className="w-fit text-[9px] uppercase font-bold tracking-widest text-art-muted border border-art-border px-2 py-0.5 rounded-sm">
                  {product.category}
                </span>
              )}
              <h2 className="text-xl font-serif italic text-art-text leading-tight">{product.name}</h2>
            </div>

            {/* Description */}
            <div className="space-y-1 border-t border-art-border/50 pt-3">
              <span className="block text-[9px] uppercase font-bold tracking-wider text-art-muted">Description</span>
              {product.description ? (
                <p className="text-xs text-art-muted leading-relaxed italic font-serif bg-current/2 p-2.5 rounded-lg border border-art-border/30">
                  {product.description}
                </p>
              ) : (
                <p className="text-xs text-art-muted/50 italic">Aucune description disponible.</p>
              )}
            </div>

            {/* Stock indicator */}
            <div className="flex items-center gap-2 pt-1 text-[9px] uppercase font-bold tracking-widest font-mono">
              {stock <= 0 ? (
                <span className="text-red-500 bg-red-50/50 border border-red-200/50 px-2 py-0.5 rounded flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  ❌ Rupture de stock
                </span>
              ) : stock <= 3 ? (
                <span className="text-red-500 animate-pulse bg-red-50/50 border border-red-200/50 px-2 py-0.5 rounded flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  🔥 Plus que {stock} exemplaires restants !
                </span>
              ) : (
                <span className="text-emerald-600 bg-emerald-50/50 border border-emerald-200/50 px-2 py-0.5 rounded flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  ✓ En stock ({stock} dispo)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer Checkout action bar */}
        <div className="p-5 border-t border-art-border bg-art-bg/80 backdrop-blur-md">
          {stock <= 0 ? (
            <div className="w-full text-xs uppercase font-bold tracking-widest text-red-500 border border-red-200 bg-red-50 py-3.5 text-center rounded-md">
              Rupture de stock
            </div>
          ) : cartQty > 0 ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center text-xs font-mono font-bold w-full justify-between border border-art-text p-1 glass-surface rounded-md">
                <button 
                  onClick={onRemoveFromCart} 
                  className="w-8 h-8 flex items-center justify-center text-art-text hover:glass border border-transparent hover:border-art-border transition-colors rounded-md"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-bold">{cartQty} dans le panier</span>
                <button 
                  onClick={(e) => onAddToCart(e)} 
                  disabled={cartQty >= stock} 
                  className="w-8 h-8 flex items-center justify-center text-art-text hover:glass border border-transparent hover:border-art-border transition-colors disabled:opacity-30 rounded-md"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <button 
                onClick={onClose}
                className="w-full text-xs uppercase font-bold tracking-widest text-white py-3.5 text-center rounded-md transition-all active:scale-[0.98]"
                style={{ backgroundColor: themeColor }}
              >
                Retour aux articles
              </button>
            </div>
          ) : (
            <button 
              onClick={(e) => {
                onAddToCart(e);
              }} 
              className="w-full text-xs uppercase font-bold tracking-widest text-white py-3.5 text-center transition-all hover:tracking-wider active:scale-[0.98] duration-300 shadow-lg rounded-md"
              style={{ backgroundColor: themeColor }}
            >
              Ajouter au panier • {product.price.toFixed(0)} F
            </button>
          )}
        </div>
      </div>
    </>
  );
}
