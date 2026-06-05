import React, { useEffect, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Product } from '../../types';
import QRCode from 'qrcode';
import { Download, Printer, Copy, Check, Upload, RefreshCw, QrCode, Sparkles, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { COUNTRIES } from '../../data/countries';

interface QrCodeGeneratorProps {
  user: User;
}

type FrameType = 'none' | 'affiche_a4' | 'chevalet' | 'colis';

export function QrCodeGenerator({ user }: QrCodeGeneratorProps) {
  const { storeData } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const printCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Data states
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // QR Settings
  const [linkType, setLinkType] = useState<'store' | 'product'>('store');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [fgColor, setFgColor] = useState<string>('#000000');
  const [bgColor, setBgColor] = useState<string>('#ffffff');
  const [frameType, setFrameType] = useState<FrameType>('affiche_a4');
  const [logoType, setLogoType] = useState<'none' | 'whatsapp' | 'custom'>('whatsapp');
  const [customLogoUrl, setCustomLogoUrl] = useState<string>('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Computed target URL
  const [targetUrl, setTargetUrl] = useState('');

  const currency = storeData ? (COUNTRIES[storeData.country || 'CI']?.currency || 'FCFA') : 'FCFA';

  // Load products & set default colors
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('user_id', user.id)
          .order('name');
        if (data) {
          setProducts(data.map(d => ({
            id: d.id,
            name: d.name,
            price: Number(d.price),
            description: d.description,
            imageUrl: d.image,
            category: d.category,
            stock: d.stock_count
          })));
          if (data.length > 0) {
            setSelectedProductId(data[0].id);
          }
        }
      } catch (err) {
        console.error("Error fetching products", err);
      } finally {
        setLoadingProducts(false);
      }
    };
    fetchProducts();

    if (storeData?.theme_color) {
      setFgColor(storeData.theme_color);
    }
  }, [user.id, storeData]);

  // Update target URL based on settings
  useEffect(() => {
    if (!storeData) return;
    const origin = window.location.origin;
    if (linkType === 'store') {
      setTargetUrl(`${origin}/${storeData.store_url}`);
    } else if (linkType === 'product' && selectedProductId) {
      setTargetUrl(`${origin}/${storeData.store_url}?p=${selectedProductId}`);
    }
  }, [linkType, selectedProductId, storeData]);

  // Generate the QR Code to canvas
  const generateQRCode = async (canvasElement: HTMLCanvasElement | null, widthSize = 300) => {
    if (!canvasElement || !targetUrl) return;

    try {
      // Use higher error correction when embedding a logo
      const errorLevel = logoType !== 'none' ? 'H' : 'M';
      
      await QRCode.toCanvas(canvasElement, targetUrl, {
        width: widthSize,
        margin: 1,
        color: {
          dark: fgColor,
          light: bgColor,
        },
        errorCorrectionLevel: errorLevel
      });

      // Overlay center logo
      if (logoType !== 'none') {
        const ctx = canvasElement.getContext('2d');
        if (ctx) {
          const logo = new Image();
          logo.crossOrigin = 'anonymous';

          if (logoType === 'whatsapp') {
            // Simple base64 SVG for WhatsApp logo
            logo.src = `data:image/svg+xml;utf8,${encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="${fgColor === '#25d366' || fgColor === '#25D366' ? '#128c7e' : '#25d366'}"><path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/></svg>`
            )}`;
          } else if (logoType === 'custom' && customLogoUrl) {
            logo.src = customLogoUrl;
          } else {
            return;
          }

          logo.onload = () => {
            const logoSize = canvasElement.width * 0.22;
            const x = (canvasElement.width - logoSize) / 2;
            const y = (canvasElement.height - logoSize) / 2;

            // Draw rounded white badge background behind logo
            ctx.fillStyle = bgColor;
            ctx.beginPath();
            const radius = 6;
            ctx.roundRect(x - 4, y - 4, logoSize + 8, logoSize + 8, radius);
            ctx.fill();

            // Draw logo image
            ctx.drawImage(logo, x, y, logoSize, logoSize);
          };
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Re-generate QR code on settings change
  useEffect(() => {
    generateQRCode(canvasRef.current, 300);
    generateQRCode(printCanvasRef.current, 500);
  }, [targetUrl, fgColor, bgColor, logoType, customLogoUrl]);

  // Handle custom logo upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoUploading(true);
    try {
      const filePath = `${user.id}/logo_${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage
        .from('products')
        .upload(filePath, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('products')
        .getPublicUrl(data.path);

      setCustomLogoUrl(publicUrl);
      toast.success("Logo chargé avec succès !");
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de l'upload du logo");
    } finally {
      setLogoUploading(false);
    }
  };

  // Copy URL to clipboard
  const handleCopyLink = () => {
    navigator.clipboard.writeText(targetUrl);
    setCopied(true);
    toast.success("Lien copié dans le presse-papiers !");
    setTimeout(() => setCopied(false), 2000);
  };

  // Download raw QR code PNG
  const handleDownloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement('a');
    const filename = linkType === 'store' 
      ? `qrcode-${storeData?.store_url || 'boutique'}.png`
      : `qrcode-produit-${selectedProductId}.png`;

    link.download = filename;
    link.href = dataUrl;
    link.click();
    toast.success("QR Code téléchargé !");
  };

  // Print function
  const handlePrint = () => {
    window.print();
  };

  // Get active product name
  const getSelectedProductName = () => {
    const p = products.find(p => p.id === selectedProductId);
    return p ? p.name : 'Produit';
  };

  // Get active product price
  const getSelectedProductPrice = () => {
    const p = products.find(p => p.id === selectedProductId);
    return p ? `${p.price.toLocaleString('fr-FR')} ${currency}` : '';
  };

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-16 print:p-0 print:space-y-0">
      
      {/* SCREEN VIEW ONLY HEADER */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-art-border pb-6 gap-6 print:hidden">
        <div>
          <h1 className="text-4xl font-serif italic tracking-tight text-art-text">Code QR Boutique & Stands</h1>
          <p className="text-xs uppercase tracking-widest text-art-muted mt-2">Générez des fiches élégantes pour vos stands, salons ou colis</p>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-5 py-3 bg-art-text text-white hover:opacity-90 active:scale-[0.98] transition shadow-[4px_4px_0px_0px_var(--color-art-accent)] text-xs font-bold uppercase tracking-widest"
        >
          <Printer className="w-4 h-4" /> Imprimer la Fiche
        </button>
      </header>

      {/* DUAL PANEL LAYOUT (SCREEN ONLY) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 print:hidden">
        
        {/* LEFT COLUMN: CONTROLS */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Target link config */}
          <div className="glass-surface border border-art-border p-6 space-y-4">
            <h3 className="text-xs uppercase tracking-widest font-bold text-art-text flex items-center gap-2">
              <QrCode className="w-4 h-4 text-art-accent" /> 1. Choix de la Destination
            </h3>
            
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLinkType('store')}
                className={`py-3 text-xs uppercase font-bold tracking-wider border transition-colors ${
                  linkType === 'store'
                    ? 'border-art-text bg-art-text text-white'
                    : 'border-art-border hover:border-art-text text-art-muted hover:text-art-text'
                }`}
              >
                Ma Boutique
              </button>
              <button
                type="button"
                onClick={() => setLinkType('product')}
                className={`py-3 text-xs uppercase font-bold tracking-wider border transition-colors ${
                  linkType === 'product'
                    ? 'border-art-text bg-art-text text-white'
                    : 'border-art-border hover:border-art-text text-art-muted hover:text-art-text'
                }`}
              >
                Un Produit
              </button>
            </div>

            {linkType === 'product' && (
              <div className="space-y-2 pt-2 animate-fadeIn">
                <label className="text-[10px] uppercase tracking-widest text-art-muted font-semibold block">Sélectionner le produit</label>
                {loadingProducts ? (
                  <div className="text-xs text-art-muted italic">Chargement des produits...</div>
                ) : products.length === 0 ? (
                  <div className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Aucun produit enregistré.
                  </div>
                ) : (
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full px-3 py-2 bg-white/20 dark:bg-black/20 border border-art-border focus:outline-none focus:border-art-text text-sm"
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.id} className="bg-art-bg text-art-text">
                        {p.name} ({p.price.toLocaleString('fr-FR')} {currency})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="pt-2 space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-art-muted font-semibold block">Lien du scan</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={targetUrl}
                  className="flex-1 px-3 py-2 bg-white/5 border border-art-border text-xs text-art-muted select-all focus:outline-none"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-3 border border-art-border hover:border-art-text hover:bg-white/10 active:scale-[0.96] transition flex items-center justify-center"
                  title="Copier le lien"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Style Customization */}
          <div className="glass-surface border border-art-border p-6 space-y-6">
            <h3 className="text-xs uppercase tracking-widest font-bold text-art-text flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-art-accent" /> 2. Personnalisation Visuelle
            </h3>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-art-muted font-semibold block">Couleur QR Code</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={fgColor}
                    onChange={(e) => setFgColor(e.target.value)}
                    className="w-10 h-10 border border-art-border cursor-pointer p-0 bg-transparent rounded"
                  />
                  <input
                    type="text"
                    value={fgColor}
                    onChange={(e) => setFgColor(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-2 text-xs font-mono border border-art-border bg-white/5 uppercase"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-art-muted font-semibold block">Couleur de Fond</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-10 h-10 border border-art-border cursor-pointer p-0 bg-transparent rounded"
                  />
                  <input
                    type="text"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-2 text-xs font-mono border border-art-border bg-white/5 uppercase"
                  />
                </div>
              </div>
            </div>

            {/* Center Logo */}
            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-widest text-art-muted font-semibold block">Logo au centre</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setLogoType('none')}
                  className={`py-2 text-[10px] uppercase font-bold tracking-wider border transition-colors ${
                    logoType === 'none'
                      ? 'border-art-text bg-art-text text-white'
                      : 'border-art-border hover:border-art-text text-art-muted hover:text-art-text'
                  }`}
                >
                  Aucun
                </button>
                <button
                  type="button"
                  onClick={() => setLogoType('whatsapp')}
                  className={`py-2 text-[10px] uppercase font-bold tracking-wider border transition-colors ${
                    logoType === 'whatsapp'
                      ? 'border-art-text bg-art-text text-white'
                      : 'border-art-border hover:border-art-text text-art-muted hover:text-art-text'
                  }`}
                >
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => setLogoType('custom')}
                  className={`py-2 text-[10px] uppercase font-bold tracking-wider border transition-colors ${
                    logoType === 'custom'
                      ? 'border-art-text bg-art-text text-white'
                      : 'border-art-border hover:border-art-text text-art-muted hover:text-art-text'
                  }`}
                >
                  Logo Store
                </button>
              </div>

              {logoType === 'custom' && (
                <div className="space-y-2 pt-1 border-t border-art-border/30">
                  <div className="flex items-center gap-3">
                    {customLogoUrl ? (
                      <div className="relative group w-12 h-12 border border-art-border flex items-center justify-center bg-white/5 overflow-hidden">
                        <img src={customLogoUrl} alt="Logo" className="w-full h-full object-contain" />
                        <button
                          onClick={() => setCustomLogoUrl('')}
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white transition-opacity font-bold uppercase"
                        >
                          Retirer
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-16 border border-dashed border-art-border hover:border-art-text cursor-pointer transition-colors bg-white/5">
                        <div className="flex flex-col items-center justify-center py-2 text-center">
                          {logoUploading ? (
                            <RefreshCw className="w-4 h-4 animate-spin text-art-muted" />
                          ) : (
                            <Upload className="w-4 h-4 text-art-muted" />
                          )}
                          <span className="text-[9px] uppercase tracking-widest text-art-muted font-bold mt-1">Importer un logo</span>
                        </div>
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={logoUploading} />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Print template selector */}
            <div className="space-y-3 pt-2">
              <label className="text-[10px] uppercase tracking-widest text-art-muted font-semibold block">Modèle de support</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFrameType('none')}
                  className={`py-2 text-[10px] uppercase font-bold tracking-wider border transition-colors ${
                    frameType === 'none'
                      ? 'border-art-text bg-art-text text-white'
                      : 'border-art-border hover:border-art-text text-art-muted hover:text-art-text'
                  }`}
                >
                  Code QR Seul
                </button>
                <button
                  type="button"
                  onClick={() => setFrameType('affiche_a4')}
                  className={`py-2 text-[10px] uppercase font-bold tracking-wider border transition-colors ${
                    frameType === 'affiche_a4'
                      ? 'border-art-text bg-art-text text-white'
                      : 'border-art-border hover:border-art-text text-art-muted hover:text-art-text'
                  }`}
                >
                  Affiche A4
                </button>
                <button
                  type="button"
                  onClick={() => setFrameType('chevalet')}
                  className={`py-2 text-[10px] uppercase font-bold tracking-wider border transition-colors ${
                    frameType === 'chevalet'
                      ? 'border-art-text bg-art-text text-white'
                      : 'border-art-border hover:border-art-text text-art-muted hover:text-art-text'
                  }`}
                >
                  Chevalet Comptoir
                </button>
                <button
                  type="button"
                  onClick={() => setFrameType('colis')}
                  className={`py-2 text-[10px] uppercase font-bold tracking-wider border transition-colors ${
                    frameType === 'colis'
                      ? 'border-art-text bg-art-text text-white'
                      : 'border-art-border hover:border-art-text text-art-muted hover:text-art-text'
                  }`}
                >
                  Étiquette Colis (x4)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: PREVIEW & ACTIONS */}
        <div className="lg:col-span-7 space-y-6 flex flex-col">
          
          <div className="glass-surface border border-art-border p-6 flex-1 flex flex-col justify-between">
            <h3 className="text-xs uppercase tracking-widest font-bold text-art-text mb-4">Aperçu de la Carte</h3>

            {/* PREVIEW CONTAINER */}
            <div className="flex-1 flex items-center justify-center p-4 bg-black/10 dark:bg-white/5 border border-art-border/30 mb-6">
              
              {/* Previewing Affiche A4 */}
              {frameType === 'affiche_a4' && (
                <div className="w-[300px] aspect-[1/1.41] bg-white text-black p-6 flex flex-col justify-between shadow-2xl relative border-4 border-double border-stone-200">
                  <div className="text-center space-y-2 mt-4">
                    <h2 className="font-serif italic text-3xl font-extrabold tracking-tight" style={{ color: fgColor }}>
                      {storeData?.store_name}
                    </h2>
                    <p className="text-[9px] uppercase tracking-widest text-stone-500 font-bold">
                      {linkType === 'store' ? "Commandez en Ligne" : "Commander cet article"}
                    </p>
                  </div>

                  <div className="flex justify-center my-3 relative">
                    <canvas ref={canvasRef} className="w-40 h-40 max-w-full" />
                  </div>

                  <div className="text-center space-y-4 mb-4">
                    {linkType === 'product' && (
                      <div className="space-y-1 bg-stone-50 p-2 border border-stone-100">
                        <h4 className="text-xs font-bold truncate max-w-[200px] mx-auto">{getSelectedProductName()}</h4>
                        <p className="text-[10px] font-mono font-bold text-emerald-600">{getSelectedProductPrice()}</p>
                      </div>
                    )}
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-stone-800">Scannez pour commander sur WhatsApp</p>
                      <p className="text-[8px] text-stone-400">Pointez votre appareil photo sur le code ci-dessus</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Previewing Chevalet fold */}
              {frameType === 'chevalet' && (
                <div className="w-[300px] aspect-[1.41/1] bg-white text-black p-4 flex justify-between shadow-2xl relative border-2 border-stone-200 divide-x divide-dashed divide-stone-300">
                  {/* Left Side (Fold Front) */}
                  <div className="w-1/2 p-3 flex flex-col justify-between h-full text-center">
                    <div className="rotate-180 flex flex-col justify-between h-full">
                      <div className="space-y-1">
                        <h4 className="font-serif italic text-lg font-bold truncate" style={{ color: fgColor }}>{storeData?.store_name}</h4>
                        <p className="text-[8px] text-stone-500 font-bold uppercase tracking-wider">Scannez-moi</p>
                      </div>
                      <div className="flex justify-center my-1 scale-75">
                        <canvas className="w-24 h-24" style={{ display: 'none' }} />
                        {/* Static visual clone for canvas rotation compatibility */}
                        <div className="w-24 h-24 bg-stone-100 flex items-center justify-center border text-[9px] text-stone-400">QR Code</div>
                      </div>
                      <p className="text-[8px] text-stone-400 italic">Pliage Comptoir</p>
                    </div>
                  </div>

                  {/* Right Side (Fold Back) */}
                  <div className="w-1/2 p-3 flex flex-col justify-between h-full text-center">
                    <div className="space-y-1">
                      <h4 className="font-serif italic text-lg font-bold truncate" style={{ color: fgColor }}>{storeData?.store_name}</h4>
                      <p className="text-[8px] text-stone-500 font-bold uppercase tracking-wider">WhatsApp Shopping</p>
                    </div>
                    <div className="flex justify-center my-1 scale-75">
                      {/* Canvas will show on screen here */}
                      <canvas className="w-24 h-24 pointer-events-none" ref={canvasRef} />
                    </div>
                    <p className="text-[8px] text-stone-600 font-semibold">1. Scannez | 2. Commandez</p>
                  </div>
                </div>
              )}

              {/* Previewing Colis */}
              {frameType === 'colis' && (
                <div className="w-[280px] bg-white text-black p-4 flex shadow-2xl relative border border-stone-200 rounded-lg gap-4 items-center">
                  <div className="flex-1 space-y-2">
                    <h4 className="font-serif italic text-base font-bold text-stone-800" style={{ color: fgColor }}>{storeData?.store_name}</h4>
                    <p className="text-[10px] font-bold text-stone-700">Merci pour votre confiance !</p>
                    <p className="text-[8px] text-stone-400 leading-tight">Suivez vos commandes, profitez de nos nouveautés ou laissez un avis.</p>
                  </div>
                  <div className="w-24 h-24 flex-shrink-0 flex items-center justify-center bg-stone-50 p-1 border">
                    <canvas ref={canvasRef} className="w-full h-full" />
                  </div>
                </div>
              )}

              {/* Previewing QrCode only */}
              {frameType === 'none' && (
                <div className="bg-white p-4 shadow-2xl border border-stone-200">
                  <canvas ref={canvasRef} className="w-56 h-56" />
                </div>
              )}

            </div>

            {/* ACTION BUTTONS */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleDownloadPng}
                className="flex items-center justify-center gap-2 border border-art-border hover:border-art-text py-3 text-xs font-bold uppercase tracking-widest transition-all active:scale-[0.98]"
              >
                <Download className="w-4 h-4" /> Télécharger (PNG)
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center justify-center gap-2 bg-art-text text-white hover:opacity-90 py-3 text-xs font-bold uppercase tracking-widest transition-all active:scale-[0.98]"
              >
                <Printer className="w-4 h-4" /> Imprimer / PDF
              </button>
            </div>

          </div>
        </div>

      </div>

      {/* ------------------------------------------------------------- */}
      {/* PRINT-ONLY CONTAINER (A4 FORMATTED)                          */}
      {/* ------------------------------------------------------------- */}
      <div className="hidden print:block print:bg-white print:text-black print:min-h-screen print:w-full print:absolute print:left-0 print:top-0 print:z-[1000] print:p-0">
        
        {/* Affiche A4 Template */}
        {frameType === 'affiche_a4' && (
          <div className="w-full min-h-screen flex flex-col justify-between py-16 px-12 border-8 border-double border-stone-300 bg-white">
            <div className="text-center space-y-6 mt-8">
              <p className="text-[12px] tracking-[0.25em] font-mono text-stone-400 uppercase font-bold">Bienvenue chez</p>
              <h2 className="font-serif italic text-6xl font-black tracking-tight" style={{ color: fgColor }}>
                {storeData?.store_name}
              </h2>
              <div className="w-24 h-0.5 bg-stone-300 mx-auto mt-4" />
              <p className="text-sm uppercase tracking-[0.2em] text-stone-500 font-extrabold max-w-lg mx-auto leading-relaxed">
                {linkType === 'store' ? "Scannez notre code pour commander en ligne et recevoir vos articles directement chez vous !" : "Scannez le code ci-dessous pour commander cet article en ligne !"}
              </p>
            </div>

            <div className="flex flex-col items-center justify-center my-10">
              <div className="p-4 border-2 border-stone-200 rounded-2xl bg-white shadow-xl mb-4">
                <canvas ref={printCanvasRef} className="w-[320px] h-[320px]" />
              </div>
              <p className="text-xs text-stone-400 font-mono">{targetUrl}</p>
            </div>

            <div className="text-center space-y-6 mb-8 max-w-xl mx-auto">
              {linkType === 'product' && (
                <div className="space-y-2 bg-stone-50 p-5 border border-stone-100 rounded-xl">
                  <h4 className="text-lg font-bold">{getSelectedProductName()}</h4>
                  <p className="text-base font-mono font-bold text-emerald-600">{getSelectedProductPrice()}</p>
                  {products.find(p => p.id === selectedProductId)?.description && (
                    <p className="text-xs text-stone-400 italic line-clamp-2 max-w-md mx-auto">
                      {products.find(p => p.id === selectedProductId)?.description}
                    </p>
                  )}
                </div>
              )}
              
              <div className="grid grid-cols-3 gap-6 pt-6 border-t border-stone-100">
                <div className="space-y-1">
                  <span className="text-xl font-bold font-serif" style={{ color: fgColor }}>01.</span>
                  <p className="text-[10px] uppercase font-bold text-stone-700">Scannez le QR</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xl font-bold font-serif" style={{ color: fgColor }}>02.</span>
                  <p className="text-[10px] uppercase font-bold text-stone-700">Ajoutez au panier</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xl font-bold font-serif" style={{ color: fgColor }}>03.</span>
                  <p className="text-[10px] uppercase font-bold text-stone-700">Validez sur WhatsApp</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Chevalet Fold template */}
        {frameType === 'chevalet' && (
          <div className="w-full min-h-screen flex flex-col justify-center items-center py-20 px-8 bg-white border-2 border-stone-100 relative">
            <div className="w-full max-w-[800px] aspect-[1.41/1] border-2 border-dashed border-stone-300 divide-x-2 divide-dashed divide-stone-300 flex">
              
              {/* Left Side (Fold Front - Rotated) */}
              <div className="w-1/2 p-8 flex flex-col justify-between h-full text-center relative overflow-hidden">
                <div className="rotate-180 flex flex-col justify-between h-full">
                  <div className="space-y-2">
                    <p className="text-[10px] tracking-wider text-stone-400 uppercase font-mono">Boutique en Ligne</p>
                    <h3 className="font-serif italic text-3xl font-extrabold truncate" style={{ color: fgColor }}>{storeData?.store_name}</h3>
                    <div className="w-12 h-0.5 bg-stone-200 mx-auto" />
                  </div>
                  <div className="flex flex-col items-center my-4 scale-95">
                    <div className="p-3 border border-stone-200 rounded bg-white shadow">
                      {/* Use image to support print rotation properly without rendering raw canvas details */}
                      <img 
                        src={canvasRef.current?.toDataURL() || ''} 
                        alt="QR Code" 
                        className="w-40 h-40" 
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-stone-600">Scannez pour commander en direct</p>
                    <p className="text-[7px] text-stone-400 mt-1 font-mono">{targetUrl}</p>
                  </div>
                </div>
                {/* Folding Guide Marker */}
                <div className="absolute top-0 right-0 bottom-0 flex flex-col justify-between text-stone-300 text-[8px] translate-x-[4px] font-mono pointer-events-none select-none">
                  <span>▲ PLIER</span>
                  <span>▲ PLIER</span>
                  <span>▲ PLIER</span>
                </div>
              </div>

              {/* Right Side (Fold Back) */}
              <div className="w-1/2 p-8 flex flex-col justify-between h-full text-center relative overflow-hidden">
                <div className="flex flex-col justify-between h-full">
                  <div className="space-y-2">
                    <p className="text-[10px] tracking-wider text-stone-400 uppercase font-mono">WhatsApp Shopping</p>
                    <h3 className="font-serif italic text-3xl font-extrabold truncate" style={{ color: fgColor }}>{storeData?.store_name}</h3>
                    <div className="w-12 h-0.5 bg-stone-200 mx-auto" />
                  </div>
                  <div className="flex flex-col items-center my-4 scale-95">
                    <div className="p-3 border border-stone-200 rounded bg-white shadow">
                      <img 
                        src={canvasRef.current?.toDataURL() || ''} 
                        alt="QR Code" 
                        className="w-40 h-40" 
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-stone-600">Commandez en un clic depuis WhatsApp</p>
                    <p className="text-[7px] text-stone-400 mt-1 font-mono">{targetUrl}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Print Instructions footer */}
            <div className="mt-8 text-center text-xs text-stone-400 font-mono">
              Instructions : Pliez cette feuille en 3 selon la ligne pointillée centrale pour créer votre chevalet de table triangulaire.
            </div>
          </div>
        )}

        {/* Colis / Inserts template (renders 4 per A4 page) */}
        {frameType === 'colis' && (
          <div className="w-full min-h-screen py-10 px-8 bg-white grid grid-cols-2 gap-8 items-start align-middle">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="border-2 border-double border-stone-300 p-6 rounded-xl bg-white flex gap-6 items-center aspect-[1.5/1]">
                <div className="flex-1 space-y-3">
                  <span className="text-[9px] tracking-widest font-mono text-stone-400 uppercase font-bold">OmniShop</span>
                  <h4 className="font-serif italic text-2xl font-black" style={{ color: fgColor }}>{storeData?.store_name}</h4>
                  <div className="w-8 h-0.5 bg-stone-200" />
                  <p className="text-[11px] font-bold text-stone-700">Merci de votre commande !</p>
                  <p className="text-[9px] text-stone-400 leading-tight">
                    Nous espérons que vos produits vous plairont. Scannez ce code QR pour laisser votre avis, suivre vos commandes ou acheter à nouveau sur notre boutique.
                  </p>
                </div>
                <div className="w-32 h-32 flex-shrink-0 flex flex-col items-center justify-center p-2 border border-stone-150 rounded-lg bg-stone-50">
                  <img 
                    src={canvasRef.current?.toDataURL() || ''} 
                    alt="QR Code" 
                    className="w-full h-full object-contain" 
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Standard raw QR Code */}
        {frameType === 'none' && (
          <div className="w-full min-h-screen flex flex-col justify-center items-center bg-white">
            <div className="p-8 border border-stone-100 rounded-3xl bg-white shadow-2xl flex flex-col items-center">
              <canvas ref={printCanvasRef} className="w-[450px] h-[450px]" />
              <h3 className="font-serif italic text-3xl font-extrabold mt-6" style={{ color: fgColor }}>{storeData?.store_name}</h3>
              <p className="text-xs text-stone-400 mt-2 font-mono">{targetUrl}</p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
