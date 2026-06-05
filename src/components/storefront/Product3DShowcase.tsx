import React, { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Product3DShowcase({ imageUrl, name }: { imageUrl?: string; name: string }) {
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [autoSpin, setAutoSpin] = useState(true);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (autoSpin) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const degX = -(y / (rect.height / 2)) * 25;
    const degY = (x / (rect.width / 2)) * 25;
    setRotate({ x: degX, y: degY });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotate({ x: 0, y: 0 });
  };

  return (
    <div className="relative w-full flex flex-col items-center justify-center py-6 bg-transparent select-none">
      {/* Spotlight background behind the floating item */}
      <div className="absolute w-48 h-48 rounded-full bg-radial-gradient from-white/10 to-transparent blur-xl pointer-events-none" />
      
      {/* Circular interactive area */}
      <div 
        className="w-64 h-64 relative flex items-center justify-center cursor-grab active:cursor-grabbing"
        style={{ perspective: '1000px' }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
      >
        {/* Shadow that shrinks / shifts beneath the floating item */}
        <div 
          className={cn(
            "absolute bottom-4 w-40 h-4 bg-black/30 rounded-full blur-md transition-all duration-700 ease-out",
            autoSpin ? "animate-[shadowPulse_4s_infinite_ease-in-out]" : isHovered ? "scale-90 opacity-80" : "scale-100 opacity-60"
          )} 
        />

        {/* Floating 3D Showcase viewport with transform-style */}
        <div 
          className="w-full h-full flex items-center justify-center p-4"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt={name} 
              className={cn(
                "max-w-[85%] max-h-[85%] object-contain filter drop-shadow-[0_25px_35px_rgba(0,0,0,0.35)] transition-all duration-300",
                autoSpin ? "animate-[itemSpin_10s_linear_infinite]" : ""
              )}
              style={!autoSpin ? {
                transform: `rotateX(${rotate.x}deg) rotateY(${rotate.y}deg) translateZ(40px)`,
              } : {
                transform: 'translateZ(40px)'
              }}
            />
          ) : (
            <ShoppingBag className="w-16 h-16 text-art-muted/40 animate-pulse" />
          )}
        </div>
      </div>

      {/* Control Buttons */}
      <div className="mt-2 flex gap-2 z-10">
        <button
          type="button"
          onClick={() => {
            setAutoSpin(true);
            setRotate({ x: 0, y: 0 });
          }}
          className={cn(
            "text-[9px] uppercase font-bold tracking-widest px-3 py-1.5 border transition-all rounded-full",
            autoSpin ? "bg-art-text text-white border-art-text shadow-sm" : "border-art-border text-art-muted hover:text-art-text hover:bg-slate-50"
          )}
        >
          🔄 Spin 3D
        </button>
        <button
          type="button"
          onClick={() => {
            setAutoSpin(false);
            setRotate({ x: 0, y: 0 });
          }}
          className={cn(
            "text-[9px] uppercase font-bold tracking-widest px-3 py-1.5 border transition-all rounded-full",
            !autoSpin ? "bg-art-text text-white border-art-text shadow-sm" : "border-art-border text-art-muted hover:text-art-text hover:bg-slate-50"
          )}
        >
          🖱️ Interactif
        </button>
      </div>

      <style>{`
        @keyframes itemSpin {
          0% {
            transform: rotateY(0deg) translateY(0px) rotateX(10deg);
          }
          25% {
            transform: rotateY(90deg) translateY(-8px) rotateX(5deg);
          }
          50% {
            transform: rotateY(180deg) translateY(0px) rotateX(-10deg);
          }
          75% {
            transform: rotateY(270deg) translateY(-8px) rotateX(5deg);
          }
          100% {
            transform: rotateY(360deg) translateY(0px) rotateX(10deg);
          }
        }
        @keyframes shadowPulse {
          0%, 100% {
            transform: scale(1) opacity-60;
            filter: blur(6px);
          }
          50% {
            transform: scale(0.85) opacity-35;
            filter: blur(4px);
          }
        }
      `}</style>
    </div>
  );
}
