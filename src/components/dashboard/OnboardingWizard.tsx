import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Loader2, 
  ArrowRight, 
  ArrowLeft, 
  Sparkles, 
  Palette, 
  ShoppingBag, 
  Check, 
  Store, 
  Phone, 
  Camera, 
  Trash2, 
  Plus, 
  AlertCircle, 
  Wand2, 
  Eye 
} from 'lucide-react';
import { toast } from 'sonner';
import imageCompression from 'browser-image-compression';
import { COUNTRIES } from '../../data/countries';
import { generateStoreFromDescription, AIStoreResult, AIProduct } from '../../lib/gemini';

interface OnboardingWizardProps {
  userId: string;
  onComplete: () => Promise<void>;
}

export function OnboardingWizard({ userId, onComplete }: OnboardingWizardProps) {
  // Mode de configuration : 'select' (sélection), 'classic' (manuel), 'ai' (IA Magic)
  const [mode, setMode] = useState<'select' | 'classic' | 'ai'>('select');
  
  // Étapes de l'assistant (commence à 1)
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadingSubMessage, setLoadingSubMessage] = useState('');

  // -------------------------------------------------------------
  // Variables communes
  // -------------------------------------------------------------
  const [selectedCountry, setSelectedCountry] = useState('CI');
  const [whatsapp, setWhatsapp] = useState('');
  const currency = COUNTRIES[selectedCountry]?.currency || 'FCFA';

  // Thèmes disponibles (communs)
  const themes = [
    {
      id: 'elegant',
      name: 'Luxe / Élégant',
      desc: 'Pour la haute couture, les bijoux et le premium.',
      accent: '#D4A574',
      bg: '#111111',
      text: '#F5F5F5'
    },
    {
      id: 'nature',
      name: 'Nature / Frais',
      desc: 'Pour les produits bio, cosmétiques et naturels.',
      accent: '#22C55E',
      bg: '#FDFCF8',
      text: '#1B4332'
    },
    {
      id: 'mode',
      name: 'Corail / Mode',
      desc: 'Pour le prêt-à-porter dynamique et tendance.',
      accent: '#FF6B6B',
      bg: '#FFF5F5',
      text: '#2D3748'
    },
    {
      id: 'tech',
      name: 'Océan / Tech',
      desc: 'Pour les gadgets, téléphones et accessoires.',
      accent: '#3B82F6',
      bg: '#F8FAFC',
      text: '#1E293B'
    }
  ];

  // Helper slugify
  const slugify = (text: string) => text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // -------------------------------------------------------------
  // ÉTAT DU MODE CLASSIQUE (MANUEL)
  // -------------------------------------------------------------
  const [storeName, setStoreName] = useState('');
  const [storeSlug, setStoreSlug] = useState('');
  const [selectedTheme, setSelectedTheme] = useState('elegant');
  
  // Premier produit (Mode classique)
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setStoreName(val);
    setStoreSlug(slugify(val));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  // -------------------------------------------------------------
  // ÉTAT DU MODE IA MAGIC
  // -------------------------------------------------------------
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiImages, setAiImages] = useState<File[]>([]);
  const [aiPreviews, setAiPreviews] = useState<string[]>([]);
  const [aiResult, setAiResult] = useState<AIStoreResult | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleAiImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files) as File[];
      setAiImages(prev => [...prev, ...filesArray]);
      const previewsArray = filesArray.map(file => URL.createObjectURL(file));
      setAiPreviews(prev => [...prev, ...previewsArray]);
    }
  };

  const removeAiImage = (idxToRemove: number) => {
    setAiImages(prev => prev.filter((_, i) => i !== idxToRemove));
    
    // Libérer la mémoire de l'objet URL
    URL.revokeObjectURL(aiPreviews[idxToRemove]);
    setAiPreviews(prev => prev.filter((_, i) => i !== idxToRemove));

    // Ajuster les index d'images dans les produits générés s'ils existent déjà
    if (aiResult) {
      const adjustedProducts = aiResult.products.map(p => {
        if (p.imageIndex === idxToRemove) {
          return { ...p, imageIndex: -1 };
        } else if (p.imageIndex > idxToRemove) {
          return { ...p, imageIndex: p.imageIndex - 1 };
        }
        return p;
      });
      setAiResult(prev => prev ? { ...prev, products: adjustedProducts } : null);
    }
  };

  const updateAiResultField = (key: keyof AIStoreResult, value: any) => {
    setAiResult(prev => prev ? { ...prev, [key]: value } : null);
  };

  const updateAiProduct = (index: number, updatedProduct: Partial<AIProduct>) => {
    setAiResult(prev => {
      if (!prev) return null;
      const newProducts = [...prev.products];
      newProducts[index] = { ...newProducts[index], ...updatedProduct };
      return { ...prev, products: newProducts };
    });
  };

  const deleteAiProduct = (index: number) => {
    setAiResult(prev => {
      if (!prev) return null;
      return {
        ...prev,
        products: prev.products.filter((_, i) => i !== index)
      };
    });
  };

  // -------------------------------------------------------------
  // Gestionnaires de chargement et d'upload d'images
  // -------------------------------------------------------------
  const uploadImage = async (file: File): Promise<string> => {
    const options = {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 1080,
      useWebWorker: true,
    };
    const compressedFile = await imageCompression(file, options);
    const filePath = `${userId}/${Date.now()}_${compressedFile.name}`;
    
    const { data, error } = await supabase.storage
      .from('products')
      .upload(filePath, compressedFile);
      
    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage
      .from('products')
      .getPublicUrl(data.path);
      
    return publicUrl;
  };

  // -------------------------------------------------------------
  // Appel à Gemini et animation d'onboarding IA
  // -------------------------------------------------------------
  const runAiOnboarding = async () => {
    if (!aiPrompt.trim()) {
      toast.error("Veuillez décrire votre projet de boutique.");
      return;
    }
    if (!whatsapp.trim()) {
      toast.error("Veuillez entrer votre numéro WhatsApp.");
      return;
    }
    const waRegex = /^\+?\d{8,15}$/;
    if (!waRegex.test(whatsapp.replace(/\s+/g, ''))) {
      toast.error("Format de numéro WhatsApp invalide. Exemple: +2250700000000");
      return;
    }

    setStep(2); // Étape de chargement animée
    setLoading(true);

    // Messages progressifs animés
    const loadingSteps = [
      { msg: "Analyse de vos images et de votre texte...", sub: "Gemini étudie vos produits..." },
      { msg: "Conception de votre univers de marque...", sub: "Création d'un nom et d'une description uniques..." },
      { msg: "Sélection du thème visuel adapté...", sub: "Choix de l'ambiance et des couleurs de votre vitrine..." },
      { msg: "Génération de vos fiches produits WhatsApp...", sub: "Calcul des prix et rédaction des descriptions vendeuses..." },
      { msg: "Organisation de vos rayons...", sub: "Création des catégories de vente..." },
      { msg: "Finalisation du projet...", sub: "Presque prêt à vous montrer le chef-d'œuvre !" }
    ];

    let currentMsgIndex = 0;
    setLoadingMessage(loadingSteps[0].msg);
    setLoadingSubMessage(loadingSteps[0].sub);

    const interval = setInterval(() => {
      currentMsgIndex = (currentMsgIndex + 1) % loadingSteps.length;
      setLoadingMessage(loadingSteps[currentMsgIndex].msg);
      setLoadingSubMessage(loadingSteps[currentMsgIndex].sub);
    }, 2800);

    try {
      const result = await generateStoreFromDescription(aiPrompt, aiImages);
      setAiResult(result);
      setStep(3); // Aller vers l'écran de prévisualisation/édition
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Une erreur est survenue lors de la génération IA.");
      setStep(1); // Revenir au formulaire
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Sauvegarde finale pour le Mode Classique
  // -------------------------------------------------------------
  const handleClassicFinish = async () => {
    setLoading(true);
    try {
      const activeTheme = themes.find(t => t.id === selectedTheme) || themes[0];
      const cleanedWhatsApp = whatsapp.replace(/\s+/g, '');

      // 1. Mettre à jour le profil du marchand
      const { error: userError } = await supabase
        .from('users')
        .update({
          store_name: storeName.trim(),
          store_url: storeSlug.trim(),
          whatsapp_number: cleanedWhatsApp,
          theme_color: activeTheme.accent,
          background_color: activeTheme.bg,
          text_color: activeTheme.text,
          country: selectedCountry,
          store_description: `Bienvenue sur la boutique de ${storeName} ! Retrouvez nos produits de qualité commandables directement par WhatsApp.`,
          categories: ['Général']
        })
        .eq('id', userId);

      if (userError) throw userError;

      // 2. Créer le premier produit si renseigné
      if (prodName.trim() && prodPrice.trim()) {
        let imageUrl = '';
        if (imageFile) {
          imageUrl = await uploadImage(imageFile);
        } else {
          imageUrl = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80';
        }

        const { error: prodError } = await supabase.from('products').insert({
          user_id: userId,
          name: prodName.trim(),
          price: Number(prodPrice),
          description: prodDesc.trim() || 'Produit ajouté lors de la configuration initiale de la boutique.',
          image: imageUrl,
          category: 'Général',
          in_stock: true,
          stock_count: 10
        });

        if (prodError) throw prodError;
      }

      toast.success("Félicitations ! Votre boutique est prête 🚀");
      await onComplete();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Une erreur est survenue lors de la création.");
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Sauvegarde finale pour le Mode IA Magic
  // -------------------------------------------------------------
  const handleAIFinish = async () => {
    if (!aiResult) return;
    setStep(4); // Mode sauvegarde
    setLoading(true);
    setLoadingMessage("Enregistrement de votre boutique magique...");
    setLoadingSubMessage("Compression des images et transfert sécurisé vers la base de données...");

    try {
      const activeTheme = themes.find(t => t.id === aiResult.themeId) || themes[0];
      const cleanedWhatsApp = whatsapp.replace(/\s+/g, '');

      // 1. Mettre à jour le profil du marchand
      const { error: userError } = await supabase
        .from('users')
        .update({
          store_name: aiResult.storeName.trim(),
          store_url: aiResult.storeSlug.trim(),
          whatsapp_number: cleanedWhatsApp,
          theme_color: activeTheme.accent,
          background_color: activeTheme.bg,
          text_color: activeTheme.text,
          country: selectedCountry,
          store_description: aiResult.storeDescription.trim(),
          categories: aiResult.categories
        })
        .eq('id', userId);

      if (userError) throw userError;

      // 2. Insérer tous les produits
      for (const p of aiResult.products) {
        let imageUrl = '';
        if (p.imageIndex >= 0 && p.imageIndex < aiImages.length) {
          try {
            imageUrl = await uploadImage(aiImages[p.imageIndex]);
          } catch (imgErr) {
            console.error("Erreur de téléversement d'image, utilisation du fallback", imgErr);
            imageUrl = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80';
          }
        } else {
          imageUrl = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80';
        }

        const { error: prodError } = await supabase.from('products').insert({
          user_id: userId,
          name: p.name.trim(),
          price: Number(p.price),
          description: p.description.trim() || 'Produit généré par IA.',
          image: imageUrl,
          category: p.category || 'Nouveautés',
          in_stock: true,
          stock_count: 10
        });

        if (prodError) throw prodError;
      }

      toast.success("Magie accomplie ! Votre boutique est prête 🚀");
      await onComplete();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erreur lors de la sauvegarde finale.");
      setStep(3); // Retour à l'édition si échec
    } finally {
      setLoading(false);
    }
  };

  // Navigations d'étape du Mode classique
  const handleClassicNextStep = () => {
    if (step === 1) {
      if (!storeName.trim()) {
        toast.error("Veuillez saisir le nom de votre boutique.");
        return;
      }
      if (!storeSlug.trim()) {
        toast.error("Veuillez configurer l'URL de votre boutique.");
        return;
      }
      if (!whatsapp.trim()) {
        toast.error("Veuillez entrer votre numéro WhatsApp.");
        return;
      }
      const waRegex = /^\+?\d{8,15}$/;
      if (!waRegex.test(whatsapp.replace(/\s+/g, ''))) {
        toast.error("Format de numéro WhatsApp invalide. Exemple: +2250700000000");
        return;
      }
    }
    setStep(prev => prev + 1);
  };

  const handleClassicPrevStep = () => {
    setStep(prev => prev - 1);
  };

  // -------------------------------------------------------------
  // RENDU PRINCIPAL
  // -------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 bg-[#FDFCF8] flex items-center justify-center p-4 overflow-y-auto">
      {/* Arrière-plans décoratifs et animés */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-amber-200/30 rounded-full blur-3xl -z-10 animate-pulse duration-4000" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-rose-200/30 rounded-full blur-3xl -z-10 animate-pulse duration-6000" />

      {/* -------------------------------------------------------------
          ÉCRAN 0 : SÉLECTION DE MODE
          ------------------------------------------------------------- */}
      {mode === 'select' && (
        <div className="w-full max-w-3xl bg-white border border-art-border shadow-2xl p-8 md:p-12 relative flex flex-col justify-between min-h-[550px] transition-all">
          {/* Angles décoratifs rétro-chic */}
          <div className="absolute -top-3 -right-3 w-6 h-6 border-t-2 border-r-2 border-art-text" />
          <div className="absolute -bottom-3 -left-3 w-6 h-6 border-b-2 border-l-2 border-art-text" />

          <div className="text-center space-y-3 mb-10">
            <span className="text-xs uppercase tracking-widest text-art-muted font-bold block">
              Bienvenue sur OmniShop
            </span>
            <h1 className="text-4xl md:text-5xl font-serif italic text-art-text">
              Comment souhaitez-vous configurer votre boutique ?
            </h1>
            <p className="text-sm text-art-muted max-w-lg mx-auto">
              Choisissez l'IA Magic pour générer toute votre boutique en 10 secondes ou configurez tout manuellement étape par étape.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch mb-8">
            {/* Option IA Magic */}
            <button
              onClick={() => {
                setMode('ai');
                setStep(1);
              }}
              className="group text-left border-2 border-amber-300 bg-amber-50/20 hover:bg-amber-50/40 hover:border-amber-400 p-6 md:p-8 flex flex-col justify-between rounded-xl relative transition-all duration-300 shadow-[6px_6px_0px_rgba(245,158,11,0.15)] hover:shadow-[10px_10px_0px_rgba(245,158,11,0.25)] hover:-translate-y-1"
            >
              <div className="absolute top-4 right-4 bg-amber-100 text-amber-700 px-3 py-1 text-[9px] uppercase tracking-widest font-extrabold rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500 animate-spin" /> IA Magic
              </div>
              <div className="space-y-4">
                <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Wand2 className="w-8 h-8 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-2xl font-serif italic text-art-text font-bold">Création Express par IA</h3>
                  <p className="text-xs text-art-muted mt-2 leading-relaxed">
                    Décrivez simplement vos produits en français naturel (ex: "je veux vendre des huiles de karité...") et déposez vos photos. Gemini s'occupe de tout le reste !
                  </p>
                </div>
              </div>
              <ul className="mt-6 space-y-2 border-t border-amber-200/50 pt-4 w-full text-xs text-art-text">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-amber-500" /> Analyse automatique de vos images</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-amber-500" /> Nom, slogan et descriptions WhatsApp</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-amber-500" /> Choix intelligent du thème et univers</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-amber-500" /> Fiches produits configurées avec prix</li>
              </ul>
            </button>

            {/* Option Classique */}
            <button
              onClick={() => {
                setMode('classic');
                setStep(1);
              }}
              className="group text-left border border-art-border bg-white hover:border-art-text p-6 md:p-8 flex flex-col justify-between rounded-xl transition-all duration-300 shadow-[6px_6px_0px_rgba(0,0,0,0.05)] hover:shadow-[10px_10px_0px_rgba(0,0,0,0.1)] hover:-translate-y-1"
            >
              <div className="space-y-4">
                <div className="w-14 h-14 bg-slate-100 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Store className="w-8 h-8 text-slate-700" />
                </div>
                <div>
                  <h3 className="text-2xl font-serif italic text-art-text font-bold">Méthode Classique</h3>
                  <p className="text-xs text-art-muted mt-2 leading-relaxed">
                    Remplissez manuellement les formulaires pas à pas. Recommandé si vous avez déjà un plan précis, des textes rédigés et des prix fixes.
                  </p>
                </div>
              </div>
              <ul className="mt-6 space-y-2 border-t border-slate-100 pt-4 w-full text-xs text-art-text">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-slate-500" /> Vous déterminez vous-même l'URL</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-slate-500" /> Choix libre du thème de couleurs</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-slate-500" /> Saisie manuelle de votre premier produit</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-slate-500" /> Configuration classique en 3 étapes</li>
              </ul>
            </button>
          </div>

          <div className="text-center text-[10px] text-art-muted uppercase tracking-widest font-bold">
            OmniShop.io — L'e-commerce africain simplifié
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          MODE CLASSIQUE (MANUEL)
          ------------------------------------------------------------- */}
      {mode === 'classic' && (
        <div className="w-full max-w-2xl bg-white border border-art-border shadow-2xl p-8 relative flex flex-col justify-between min-h-[500px]">
          {/* Angles décoratifs */}
          <div className="absolute -top-3 -right-3 w-6 h-6 border-t-2 border-r-2 border-art-text" />
          <div className="absolute -bottom-3 -left-3 w-6 h-6 border-b-2 border-l-2 border-art-text" />

          {/* Indicateur d'étape */}
          <div className="flex items-center justify-between mb-8">
            <span className="text-sm font-serif italic text-art-text font-bold">Configuration Manuelle</span>
            <div className="flex gap-2">
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`h-2 transition-all duration-300 rounded-full ${i === step ? 'w-8 bg-art-text' : 'w-2 bg-art-border'}`}
                />
              ))}
            </div>
          </div>

          {/* Rendu des étapes classiques */}
          <div className="flex-1 mb-8">
            {step === 1 && (
              <div className="space-y-6 animate-fade-in">
                <div className="space-y-2">
                  <h2 className="text-3xl font-serif italic text-art-text flex items-center gap-2">
                    <Store className="w-8 h-8 text-art-accent" /> Configurez votre vitrine
                  </h2>
                  <p className="text-xs uppercase tracking-widest text-art-muted">
                    Créons le lien de votre boutique en quelques secondes
                  </p>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">
                      Nom de votre boutique *
                    </label>
                    <input
                      type="text"
                      value={storeName}
                      onChange={handleNameChange}
                      className="w-full border border-art-border p-3 focus:outline-none focus:border-art-text text-sm transition-colors"
                      placeholder="Ex: Fatou Cosmétiques, Chic Mode..."
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">
                      Lien de votre boutique (URL unique) *
                    </label>
                    <div className="flex items-center border border-art-border bg-slate-50 p-3">
                      <span className="text-xs text-art-muted select-none font-mono">omnishop.io/</span>
                      <input
                        type="text"
                        value={storeSlug}
                        onChange={e => setStoreSlug(slugify(e.target.value))}
                        className="flex-1 bg-transparent focus:outline-none text-sm font-mono font-bold"
                        placeholder="fatou-cosmetiques"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">
                      Pays d'opération *
                    </label>
                    <select
                      value={selectedCountry}
                      onChange={e => {
                        const code = e.target.value;
                        setSelectedCountry(code);
                        const prefix = COUNTRIES[code]?.phonePrefix || '';
                        if (!whatsapp || whatsapp === COUNTRIES[selectedCountry]?.phonePrefix) {
                          setWhatsapp(prefix);
                        }
                      }}
                      className="w-full border border-art-border p-3 focus:outline-none focus:border-art-text text-sm bg-white"
                      required
                    >
                      {Object.values(COUNTRIES).map(c => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.name} ({c.currency})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" /> Numéro WhatsApp (Pour recevoir les commandes) *
                    </label>
                    <input
                      type="tel"
                      value={whatsapp}
                      onChange={e => setWhatsapp(e.target.value)}
                      className="w-full border border-art-border p-3 focus:outline-none focus:border-art-text text-sm font-mono"
                      placeholder="Ex: +2250700000000 (Côte d'Ivoire)"
                      required
                    />
                    <p className="text-[10px] text-art-muted mt-1 italic">
                      Incluez le code pays (ex: +225 pour la Côte d'Ivoire, +221 pour le Sénégal).
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6 animate-fade-in">
                <div className="space-y-2">
                  <h2 className="text-3xl font-serif italic text-art-text flex items-center gap-2">
                    <Palette className="w-8 h-8 text-art-accent" /> Choisissez votre univers
                  </h2>
                  <p className="text-xs uppercase tracking-widest text-art-muted">
                    Sélectionnez le thème visuel qui vous correspond le mieux
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {themes.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTheme(t.id)}
                      className={`p-4 border text-left flex flex-col justify-between transition-all relative ${selectedTheme === t.id ? 'border-art-text bg-slate-50 ring-2 ring-art-text' : 'border-art-border hover:border-art-text/50'}`}
                    >
                      {selectedTheme === t.id && (
                        <span className="absolute top-2 right-2 w-5 h-5 bg-art-text text-white rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                      <div>
                        <span className="font-bold text-sm block mb-1">{t.name}</span>
                        <span className="text-[10px] text-art-muted block leading-relaxed mb-4">{t.desc}</span>
                      </div>

                      <div className="flex gap-2 items-center mt-2 border-t border-art-border/40 pt-2 w-full">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.accent }} />
                        <div className="w-4 h-4 rounded-full border border-slate-300" style={{ backgroundColor: t.bg }} />
                        <span className="text-[9px] uppercase tracking-wider font-mono text-art-muted ml-auto">Aperçu</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6 animate-fade-in">
                <div className="space-y-2">
                  <h2 className="text-3xl font-serif italic text-art-text flex items-center gap-2">
                    <ShoppingBag className="w-8 h-8 text-art-accent" /> Ajoutez votre premier produit
                  </h2>
                  <p className="text-xs uppercase tracking-widest text-art-muted">
                    Ou passez cette étape pour démarrer avec des démos
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-start">
                  <div className="sm:col-span-1">
                    <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">
                      Photo du produit
                    </label>
                    <div className="relative group border border-dashed border-art-border hover:border-art-text transition-colors aspect-square flex flex-col items-center justify-center cursor-pointer p-4 bg-slate-50">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                      {imagePreview ? (
                        <img src={imagePreview} alt="Aperçu" className="w-full h-full object-cover" />
                      ) : (
                        <>
                          <Camera className="w-6 h-6 text-art-muted mb-2" />
                          <span className="text-[9px] uppercase font-bold tracking-widest text-art-muted text-center leading-normal">
                            Uploader
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="sm:col-span-2 space-y-4">
                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">
                        Nom du produit
                      </label>
                      <input
                        type="text"
                        value={prodName}
                        onChange={e => setProdName(e.target.value)}
                        className="w-full border border-art-border p-3 focus:outline-none focus:border-art-text text-sm"
                        placeholder="Ex: Sneakers Premium, Robe d'été..."
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">
                        Prix ({currency})
                      </label>
                      <input
                        type="number"
                        value={prodPrice}
                        onChange={e => setProdPrice(e.target.value)}
                        className="w-full border border-art-border p-3 focus:outline-none focus:border-art-text text-sm font-mono"
                        placeholder="Ex: 25000"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">
                        Description <span className="font-normal italic lowercase text-xs">(optionnel)</span>
                      </label>
                      <textarea
                        value={prodDesc}
                        onChange={e => setProdDesc(e.target.value)}
                        className="w-full border border-art-border p-3 focus:outline-none focus:border-art-text text-sm h-16 resize-none"
                        placeholder="Décrivez brièvement le produit..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Navigation bas du formulaire */}
          <div className="flex items-center justify-between border-t border-art-border pt-6">
            <button
              type="button"
              onClick={() => {
                if (step === 1) {
                  setMode('select');
                } else {
                  handleClassicPrevStep();
                }
              }}
              className="flex items-center gap-2 text-xs uppercase font-bold tracking-widest text-art-muted hover:text-art-text transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Retour
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={handleClassicNextStep}
                className="flex items-center gap-2 text-xs uppercase font-bold tracking-widest text-art-text border-2 border-art-text px-6 py-3 hover:bg-art-text hover:text-white transition-all shadow-[4px_4px_0px_rgba(0,0,0,0.1)] active:translate-y-px"
              >
                Suivant <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClassicFinish}
                disabled={loading}
                className="flex items-center gap-2 text-xs uppercase font-bold tracking-widest bg-art-text text-white px-8 py-4 transition-all shadow-[4px_4px_0px_rgba(0,0,0,0.1)] hover:bg-black disabled:opacity-50"
              >
                {loading ? (
                  <>Création... <Loader2 className="w-4 h-4 animate-spin" /></>
                ) : (
                  <>Lancer ma boutique <Sparkles className="w-4 h-4 text-amber-300" /></>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          MODE IA MAGIC
          ------------------------------------------------------------- */}
      {mode === 'ai' && (
        <div className="w-full max-w-4xl bg-white border border-art-border shadow-2xl p-8 relative flex flex-col justify-between min-h-[550px] transition-all">
          {/* Angles décoratifs */}
          <div className="absolute -top-3 -right-3 w-6 h-6 border-t-2 border-r-2 border-art-text" />
          <div className="absolute -bottom-3 -left-3 w-6 h-6 border-b-2 border-l-2 border-art-text" />

          {/* Étape AI-1 : Le formulaire de commande en langage naturel */}
          {step === 1 && (
            <div className="flex-1 flex flex-col justify-between">
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-art-border pb-4">
                  <div className="space-y-1">
                    <h2 className="text-3xl font-serif italic text-art-text flex items-center gap-2">
                      <Sparkles className="w-7 h-7 text-amber-500 animate-pulse" /> IA Magic — Configuration instantanée
                    </h2>
                    <p className="text-xs uppercase tracking-widest text-art-muted">
                      Entrez quelques instructions simples et vos photos
                    </p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-100 text-amber-800 px-3 py-1 rounded-full">
                    Étape 1 sur 2
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                  <div className="space-y-4">
                    {/* Commande textuelle */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">
                        Suggestions par secteur d'activité :
                      </label>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {[
                          {
                            label: "💅 Beauté & Cosmétiques",
                            text: "Je veux créer une boutique de cosmétiques bio 'Nour Cosmetics'. Je propose des huiles de karité pures, des savons artisanaux au curcuma, et des sérums hydratants. Rédige des fiches produits avec des descriptions hyper vendeuses et élégantes !"
                          },
                          {
                            label: "👗 Mode & Vêtements",
                            text: "Crée une boutique de mode et vêtements tendance appelée 'Chic Confection'. Je vends des robes d'été légères, des ensembles en pagne moderne, et des sacs à main élégants. Propose un univers visuel tendance et coloré."
                          },
                          {
                            label: "🍔 Restauration & Plats",
                            text: "Je lance une boutique de livraison de nourriture appelée 'Délices de chez Nous'. Je propose des plats de Garba de luxe (semoule de manioc et thon frit), du poulet braisé mariné, et des bouteilles de Bissap frais. Donne-moi un style dynamique et gourmand."
                          },
                          {
                            label: "🔌 Électronique & Tech",
                            text: "Je veux une boutique de gadgets électroniques appelée 'Tech Horizon'. Je vends des écouteurs sans fil bluetooth haut de gamme, des chargeurs rapides USB-C, et des montres connectées de sport. Propose un univers moderne et épuré."
                          }
                        ].map((template, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setAiPrompt(template.text)}
                            className="text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-1.5 border border-slate-200 hover:border-amber-400 bg-slate-50 hover:bg-amber-50/20 text-art-text rounded-full transition-all cursor-pointer"
                          >
                            {template.label}
                          </button>
                        ))}
                      </div>

                      <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">
                        Décrivez votre boutique et ce que vous vendez *
                      </label>
                      <textarea
                        value={aiPrompt}
                        onChange={e => setAiPrompt(e.target.value)}
                        rows={5}
                        className="w-full border border-art-border p-3 focus:outline-none focus:border-art-text text-sm resize-none rounded-lg focus:ring-1 focus:ring-art-text transition-all leading-relaxed"
                        placeholder="Ex: Je veux créer une boutique de cosmétiques bio 'Nour Cosmetics'. Je propose des huiles de karité, des savons artisanaux au curcuma, et des sérums hydratants. Rédige des descriptions WhatsApp hyper vendeuses et élégantes !"
                        required
                      />
                      <p className="text-[10px] text-art-muted mt-1 italic">
                        Sélectionnez une suggestion ci-dessus ou décrivez librement votre activité.
                      </p>
                    </div>

                    {/* Pays d'opération */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">
                          Pays d'opération *
                        </label>
                        <select
                          value={selectedCountry}
                          onChange={e => {
                            const code = e.target.value;
                            setSelectedCountry(code);
                            const prefix = COUNTRIES[code]?.phonePrefix || '';
                            if (!whatsapp || whatsapp === COUNTRIES[selectedCountry]?.phonePrefix) {
                              setWhatsapp(prefix);
                            }
                          }}
                          className="w-full border border-art-border p-3 focus:outline-none focus:border-art-text text-xs bg-white rounded-lg"
                          required
                        >
                          {Object.values(COUNTRIES).map(c => (
                            <option key={c.code} value={c.code}>
                              {c.flag} {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* WhatsApp */}
                      <div>
                        <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">
                          Numéro WhatsApp *
                        </label>
                        <input
                          type="tel"
                          value={whatsapp}
                          onChange={e => setWhatsapp(e.target.value)}
                          className="w-full border border-art-border p-3 focus:outline-none focus:border-art-text text-xs font-mono rounded-lg"
                          placeholder="+2250700000000"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Multi Uploader */}
                  <div className="space-y-4">
                    <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-1">
                      Photos des produits à analyser (Multi-sélection possible)
                    </label>
                    
                    <div className="relative group border-2 border-dashed border-art-border hover:border-amber-400 hover:bg-amber-50/10 transition-all aspect-[4/3] flex flex-col items-center justify-center cursor-pointer p-6 bg-slate-50/50 rounded-xl">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleAiImagesChange}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                      <Camera className="w-10 h-10 text-art-muted group-hover:text-amber-500 mb-3 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold uppercase tracking-widest text-art-text text-center">
                        Glissez ou déposez vos photos
                      </span>
                      <span className="text-[10px] text-art-muted text-center mt-1">
                        Formats acceptés : JPG, PNG. Sélectionnez plusieurs photos à la fois.
                      </span>
                    </div>

                    {/* Liste des images sélectionnées */}
                    {aiPreviews.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-[10px] uppercase tracking-widest font-bold text-art-muted block">
                          Photos sélectionnées ({aiPreviews.length}) :
                        </span>
                        <div className="grid grid-cols-4 gap-3 max-h-40 overflow-y-auto p-1">
                          {aiPreviews.map((url, index) => (
                            <div key={index} className="relative aspect-square border border-art-border rounded-lg overflow-hidden group shadow-sm bg-white">
                              <img src={url} alt={`Prévisualisation ${index}`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removeAiImage(index)}
                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white rounded-lg"
                              >
                                <Trash2 className="w-5 h-5 text-red-400" />
                              </button>
                              <span className="absolute bottom-1 right-1 bg-black/75 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md font-mono">
                                #{index + 1}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Barre de navigation */}
              <div className="flex items-center justify-between border-t border-art-border pt-6 mt-8">
                <button
                  type="button"
                  onClick={() => setMode('select')}
                  className="flex items-center gap-2 text-xs uppercase font-bold tracking-widest text-art-muted hover:text-art-text transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Retour
                </button>

                <button
                  type="button"
                  onClick={runAiOnboarding}
                  className="flex items-center gap-2 text-xs uppercase font-bold tracking-widest bg-art-text text-white px-8 py-4 transition-all shadow-[4px_4px_0px_rgba(245,158,11,0.2)] hover:bg-black active:translate-y-px font-semibold border-2 border-art-text rounded-lg"
                >
                  Générer ma boutique <Sparkles className="w-4 h-4 text-amber-300 animate-bounce" />
                </button>
              </div>
            </div>
          )}

          {/* Étape AI-2 : Rendu de chargement avec animation */}
          {step === 2 && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 space-y-8 animate-fade-in text-center">
              {/* Sphère lumineuse avec pulse et rotation */}
              <div className="relative w-28 h-28 flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-tr from-amber-400 via-rose-400 to-indigo-500 rounded-full blur-xl opacity-40 animate-pulse duration-2000" />
                <div className="absolute inset-2 bg-white rounded-full flex items-center justify-center border border-art-border shadow-inner">
                  <Wand2 className="w-10 h-10 text-amber-500 animate-spin duration-3000" />
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-3xl font-serif italic text-art-text font-bold">
                  {loadingMessage}
                </h3>
                <p className="text-sm text-art-muted max-w-md mx-auto">
                  {loadingSubMessage}
                </p>
              </div>

              {/* Barre de chargement stylisée */}
              <div className="w-full max-w-xs bg-slate-100 h-1.5 rounded-full overflow-hidden border border-art-border">
                <div className="bg-gradient-to-r from-amber-400 via-rose-400 to-indigo-500 h-full rounded-full animate-progress-bar w-full" />
              </div>

              <div className="text-[10px] text-art-muted uppercase tracking-widest font-mono">
                Alimenté par Gemini 3.5 & Google DeepMind
              </div>
            </div>
          )}

          {/* Étape AI-3 : Prévisualisation et ajustements */}
          {step === 3 && aiResult && (
            <div className="flex-1 flex flex-col justify-between overflow-y-auto max-h-[85vh] pr-2">
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-art-border pb-4 gap-4">
                  <div className="space-y-1">
                    <h2 className="text-3xl font-serif italic text-art-text flex items-center gap-2">
                      <Eye className="w-8 h-8 text-amber-500" /> Maquette de votre boutique générée
                    </h2>
                    <p className="text-xs uppercase tracking-widest text-art-muted">
                      Modifiez les données créées par l'IA avant de finaliser la mise en ligne
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-100 text-amber-800 px-3 py-1 rounded-full flex items-center gap-1 self-start">
                      <Sparkles className="w-3 h-3 text-amber-600" /> IA Optimisée
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-800 px-3 py-1 rounded-full flex items-center self-start">
                      Étape 2 sur 2
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* CONFIGURATION DE LA BOUTIQUE (1/3) */}
                  <div className="lg:col-span-1 space-y-6 border-r border-art-border/40 pr-0 lg:pr-6">
                    <h4 className="text-xs uppercase tracking-widest font-extrabold text-art-text border-b border-art-border pb-2 flex items-center gap-1.5">
                      <Store className="w-4 h-4 text-art-accent" /> Profil de boutique
                    </h4>

                    {/* Nom de la boutique */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">
                        Nom de la boutique
                      </label>
                      <input
                        type="text"
                        value={aiResult.storeName}
                        onChange={e => {
                          const val = e.target.value;
                          updateAiResultField('storeName', val);
                          updateAiResultField('storeSlug', slugify(val));
                        }}
                        className="w-full border border-art-border p-3 focus:outline-none focus:border-art-text text-sm rounded-lg"
                      />
                    </div>

                    {/* URL de la boutique */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">
                        Lien URL (omnishop.io/...)
                      </label>
                      <input
                        type="text"
                        value={aiResult.storeSlug}
                        onChange={e => updateAiResultField('storeSlug', slugify(e.target.value))}
                        className="w-full border border-art-border p-3 focus:outline-none focus:border-art-text text-sm font-mono rounded-lg"
                      />
                    </div>

                    {/* Description de la boutique */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">
                        Description de la boutique
                      </label>
                      <textarea
                        value={aiResult.storeDescription}
                        onChange={e => updateAiResultField('storeDescription', e.target.value)}
                        rows={4}
                        className="w-full border border-art-border p-3 focus:outline-none focus:border-art-text text-xs leading-relaxed rounded-lg resize-none"
                      />
                    </div>

                    {/* Thème choisi */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">
                        Univers / Thème sélectionné
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {themes.map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => updateAiResultField('themeId', t.id as any)}
                            className={`p-2.5 border text-left rounded-lg flex flex-col justify-between transition-all relative ${aiResult.themeId === t.id ? 'border-art-text bg-slate-50 ring-1 ring-art-text' : 'border-art-border hover:border-art-text/40'}`}
                          >
                            <span className="font-bold text-[10px] block leading-tight">{t.name}</span>
                            <div className="flex gap-1 items-center mt-2 w-full">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.accent }} />
                              <div className="w-3 h-3 rounded-full border border-slate-300" style={{ backgroundColor: t.bg }} />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Catégories de produits */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-widest text-art-muted mb-2">
                        Rayons / Catégories de produits
                      </label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {aiResult.categories.map((cat, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center gap-1 bg-slate-100 text-art-text text-[10px] font-bold px-2 py-1 rounded-md border border-slate-200"
                          >
                            {cat}
                            <button
                              type="button"
                              onClick={() => {
                                const newCats = aiResult.categories.filter((_, idx) => idx !== index);
                                updateAiResultField('categories', newCats);
                              }}
                              className="text-red-400 hover:text-red-600 font-bold ml-1 text-xs"
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>
                      
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newCategoryName}
                          onChange={e => setNewCategoryName(e.target.value)}
                          placeholder="Nouveau rayon..."
                          className="flex-1 border border-art-border p-2 focus:outline-none focus:border-art-text text-xs rounded-md"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newCategoryName.trim()) {
                              updateAiResultField('categories', [...aiResult.categories, newCategoryName.trim()]);
                              setNewCategoryName('');
                            }
                          }}
                          className="bg-art-text text-white p-2 text-xs rounded-md hover:bg-black font-bold flex items-center justify-center aspect-square"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* CONFIGURATION DES PRODUITS (2/3) */}
                  <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between border-b border-art-border pb-2">
                      <h4 className="text-xs uppercase tracking-widest font-extrabold text-art-text flex items-center gap-1.5">
                        <ShoppingBag className="w-4 h-4 text-art-accent" /> Fiches produits générées ({aiResult.products.length})
                      </h4>
                      
                      <button
                        type="button"
                        onClick={() => {
                          const newProduct: AIProduct = {
                            name: "Nouveau produit",
                            price: 10000,
                            description: "Description de mon nouveau produit...",
                            category: aiResult.categories[0] || "Général",
                            imageIndex: -1
                          };
                          updateAiResultField('products', [...aiResult.products, newProduct]);
                        }}
                        className="text-[10px] font-bold text-art-text border border-art-text px-3 py-1.5 hover:bg-art-text hover:text-white rounded-lg flex items-center gap-1 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" /> Ajouter un produit
                      </button>
                    </div>

                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                      {aiResult.products.map((p, index) => (
                        <div
                          key={index}
                          className="border border-art-border p-4 bg-white rounded-xl shadow-sm relative group hover:border-art-text/40 transition-all flex flex-col sm:flex-row gap-4 items-start"
                        >
                          {/* Photo miniature */}
                          <div className="w-20 h-20 bg-slate-50 border border-art-border rounded-lg overflow-hidden flex-shrink-0 relative">
                            {p.imageIndex >= 0 && p.imageIndex < aiPreviews.length ? (
                              <img src={aiPreviews[p.imageIndex]} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                                <Camera className="w-6 h-6 mb-1" />
                                <span className="text-[8px] font-bold uppercase tracking-wide">Sans image</span>
                              </div>
                            )}
                            {p.imageIndex >= 0 && (
                              <span className="absolute bottom-1 right-1 bg-black/75 text-white text-[8px] font-bold px-1 py-0.25 rounded font-mono">
                                Photo #{p.imageIndex + 1}
                              </span>
                            )}
                          </div>

                          {/* Formulaire produit */}
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                            <div className="space-y-2">
                              {/* Nom */}
                              <input
                                type="text"
                                value={p.name}
                                onChange={e => updateAiProduct(index, { name: e.target.value })}
                                placeholder="Nom du produit"
                                className="w-full border border-art-border p-2 focus:outline-none focus:border-art-text text-xs font-semibold rounded-md"
                              />
                              
                              {/* Prix et catégorie */}
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="number"
                                  value={p.price || ''}
                                  onChange={e => updateAiProduct(index, { price: Number(e.target.value) })}
                                  placeholder="Prix (FCFA)"
                                  className="w-full border border-art-border p-2 focus:outline-none focus:border-art-text text-xs font-mono rounded-md"
                                />
                                
                                <select
                                  value={p.category}
                                  onChange={e => updateAiProduct(index, { category: e.target.value })}
                                  className="w-full border border-art-border p-2 focus:outline-none focus:border-art-text text-xs bg-white rounded-md"
                                >
                                  {aiResult.categories.map((cat, idx) => (
                                    <option key={idx} value={cat}>{cat}</option>
                                  ))}
                                  <option value="Autre">Autre</option>
                                </select>
                              </div>
                            </div>

                            {/* Description */}
                            <div>
                              <textarea
                                value={p.description}
                                onChange={e => updateAiProduct(index, { description: e.target.value })}
                                placeholder="Description WhatsApp de l'article"
                                rows={3}
                                className="w-full border border-art-border p-2 focus:outline-none focus:border-art-text text-[11px] leading-relaxed resize-none rounded-md h-full min-h-[70px]"
                              />
                            </div>
                          </div>

                          {/* Bouton de suppression */}
                          <button
                            type="button"
                            onClick={() => deleteAiProduct(index)}
                            className="absolute top-2 right-2 p-1.5 text-red-400 hover:text-red-600 rounded-full hover:bg-red-50 flex items-center justify-center"
                            title="Supprimer ce produit"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation bas du formulaire */}
              <div className="flex items-center justify-between border-t border-art-border pt-6 mt-8">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1); // Retour à la commande
                  }}
                  className="flex items-center gap-2 text-xs uppercase font-bold tracking-widest text-art-muted hover:text-art-text transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Recommencer
                </button>

                <button
                  type="button"
                  onClick={handleAIFinish}
                  className="flex items-center gap-2 text-xs uppercase font-bold tracking-widest bg-amber-500 text-white px-8 py-4 transition-all shadow-[4px_4px_0px_rgba(245,158,11,0.2)] hover:bg-amber-600 active:translate-y-px font-semibold border-2 border-amber-600 rounded-lg"
                >
                  Créer ma boutique finale <Sparkles className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          )}

          {/* Étape AI-4 : Écran de chargement final pendant la création effective */}
          {step === 4 && (
            <div className="flex-1 flex flex-col items-center justify-center py-16 px-6 space-y-8 animate-fade-in text-center">
              <div className="relative">
                <Loader2 className="w-16 h-16 text-amber-500 animate-spin" />
                <div className="absolute inset-0 bg-amber-400/20 rounded-full blur-xl animate-pulse" />
              </div>

              <div className="space-y-3">
                <h3 className="text-3xl font-serif italic text-art-text font-bold">
                  {loadingMessage}
                </h3>
                <p className="text-sm text-art-muted max-w-md mx-auto">
                  {loadingSubMessage}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
