import React, { useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Package, ShoppingCart, Settings, LogOut, Loader2, Search, BarChart, CreditCard, MessageSquare, QrCode } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import imageCompression from 'browser-image-compression';

// Extracted components
import { ProductCard } from '../components/dashboard/ProductCard';
import { ProductForm } from '../components/dashboard/ProductForm';
import { EditProductModal } from '../components/dashboard/EditProductModal';
import { Orders } from '../components/dashboard/Orders';
import { Stats } from '../components/dashboard/Stats';
import { StoreSettings } from '../components/dashboard/StoreSettings';
import { Billing } from '../components/dashboard/Billing';
import { WhatsAppIntegration } from '../components/dashboard/WhatsAppIntegration';
import { QrCodeGenerator } from '../components/dashboard/QrCodeGenerator';
import { Product } from '../types/index';
import { useAuth } from '../contexts/AuthContext';
import { OnboardingWizard } from '../components/dashboard/OnboardingWizard';
import { COUNTRIES } from '../data/countries';
import { useWhatsAppQueue } from '../hooks/useWhatsAppQueue';

export default function Dashboard() {
  const { storeData, refreshStoreData } = useAuth();
  const currency = COUNTRIES[storeData?.country || 'CI']?.currency || 'FCFA';
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Background WhatsApp queue processor
  useWhatsAppQueue(user?.id);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/login');
      } else {
        setUser(session.user);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate('/login');
      else setUser(session.user);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Real-time new-order notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('dashboard:new-orders')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'orders', 
        filter: `user_id=eq.${user.id}` 
      }, payload => {
        const order = payload.new;
        if (order.status === 'pending') {
          toast.success(`Nouvelle commande de ${order.customer_name}`, {
            description: `Montant : ${Number(order.total)?.toFixed(2)} ${currency} | ${order.items?.length || 0} article(s)`,
            duration: 8000,
            action: { label: 'Voir la commande', onClick: () => navigate('/dashboard/orders') },
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-art-bg">
        <Loader2 className="w-8 h-8 animate-spin text-art-text" />
      </div>
    );
  }

  if (!user) return null;

  if (user && storeData && !storeData.store_name) {
    return <OnboardingWizard userId={user.id} onComplete={refreshStoreData} />;
  }

  return (
    <div className="flex flex-col md:flex-row h-screen font-sans text-art-text overflow-hidden relative bg-transparent">
      <Sidebar />
      <main className="flex-1 overflow-y-auto w-full p-4 md:p-12 z-10 glass-surface mt-0 md:mt-0 md:ml-0 rounded-none md:rounded-tl-2xl border-t md:border-t-0 md:border-l border-white/40 shadow-inner">
        <Routes>
          <Route path="/" element={<Products user={user} />} />
          <Route path="/orders" element={<Orders user={user} />} />
          <Route path="/stats" element={<Stats user={user} />} />
          <Route path="/billing" element={
            user.is_anonymous 
              ? <div className="max-w-md mx-auto text-center py-24 space-y-4">
                  <p className="text-2xl font-serif italic text-art-text">Mode Démo</p>
                  <p className="text-sm text-art-muted">L'abonnement n'est pas disponible en mode invité. Créez un compte pour accéder à cette fonctionnalité.</p>
                </div>
              : <Billing user={user} />
          } />
          <Route path="/whatsapp" element={<WhatsAppIntegration user={user} />} />
          <Route path="/qrcode" element={<QrCodeGenerator user={user} />} />
          <Route path="/settings" element={<StoreSettings user={user} />} />
        </Routes>
      </main>
    </div>
  );
}

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    navigate('/');
  };

  const navItems = [
    { name: 'Produits',     path: '/dashboard',          icon: Package },
    { name: 'Commandes',    path: '/dashboard/orders',   icon: ShoppingCart },
    { name: 'Statistiques', path: '/dashboard/stats',    icon: BarChart },
    { name: 'WhatsApp',     path: '/dashboard/whatsapp', icon: MessageSquare },
    { name: 'Code QR',      path: '/dashboard/qrcode',   icon: QrCode },
    { name: 'Abonnement',   path: '/dashboard/billing',  icon: CreditCard },
    { name: 'Paramètres',   path: '/dashboard/settings', icon: Settings },
  ];

  return (
    <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-art-border flex flex-col md:flex-col p-4 md:p-8 bg-art-bg/90 backdrop-blur-sm z-20 flex-shrink-0">
      <div className="mb-4 md:mb-12 flex justify-between items-center md:items-start md:flex-col">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tighter italic font-serif text-art-text">OmniShop.</h1>
          <p className="text-[10px] uppercase tracking-widest text-art-muted mt-1 hidden md:block">Social Commerce</p>
        </div>
        <button onClick={handleLogout} disabled={loggingOut} className="md:hidden flex items-center text-xs font-medium text-art-muted hover:text-art-text transition">
          {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
        </button>
      </div>
      <nav className="flex md:flex-col gap-4 md:gap-6 overflow-x-auto pb-2 md:pb-0 scrollbar-hide md:flex-1">
        {navItems.map((item, idx) => {
          const isActive = item.path === '/dashboard'
            ? location.pathname === '/dashboard'
            : location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'group flex items-center space-x-2 md:space-x-3 text-xs md:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0',
                isActive ? 'border-b-2 border-art-text pb-1 text-art-text' : 'text-art-muted hover:text-art-text'
              )}
            >
              <span className="text-[10px] uppercase font-mono glass-surface px-1">{`0${idx + 1}`}</span>
              <span className="flex items-center gap-2"><item.icon className="w-4 h-4" /> {item.name}</span>
            </Link>
          );
        })}
      </nav>
      <div className="hidden md:block mt-auto pt-4 border-t border-art-border">
        <button onClick={handleLogout} disabled={loggingOut} className="flex items-center gap-3 text-sm font-medium text-art-muted hover:text-art-text transition w-fit group disabled:opacity-50">
          {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />}
          {loggingOut ? 'Déconnexion...' : 'Déconnexion'}
        </button>
      </div>
    </aside>
  );
}

function Products({ user }: { user: User }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  // Optional categories fetched from store
  const [userCategories, setUserCategories] = useState<string[]>([]);

  useEffect(() => {
    const init = async () => {
      // Optional: fetch user categories if schema supported it. Since it was removed from schema, we skip or fetch it if needed.
      await fetchProducts();
    };
    init();
  }, [user.id]);

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
      
    if (data) {
      setProducts(data.map(d => ({
        id: d.id,
        name: d.name,
        price: Number(d.price),
        stock: d.stock_count,
        category: d.category,
        description: d.description,
        imageUrl: d.image,
        createdAt: d.created_at
      })));
    }
    setLoading(false);
  };

  const uploadImage = async (file: File): Promise<string> => {
    const options = {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 1080,
      useWebWorker: true,
    };
    try {
      const compressedFile = await imageCompression(file, options);
      const filePath = `${user.id}/${Date.now()}_${compressedFile.name}`;
      
      const { data, error } = await supabase.storage
        .from('products')
        .upload(filePath, compressedFile);
        
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage
        .from('products')
        .getPublicUrl(data.path);
        
      return publicUrl;
    } catch (error) {
      console.error("Compression/Upload error:", error);
      throw error;
    }
  };

  const handleAddProduct = async (data: Partial<Product>, file?: File | null) => {
    let finalImageUrl = data.imageUrl || '';
    if (file) {
      try { finalImageUrl = await uploadImage(file); }
      catch { toast.error('Erreur upload image.'); return; }
    }
    
    const { error } = await supabase.from('products').insert({
      user_id: user.id,
      name: data.name,
      price: data.price,
      stock_count: data.stock || 0,
      category: data.category || '',
      description: data.description || '',
      image: finalImageUrl
    });
    
    if (error) {
      toast.error('Erreur lors de l\'ajout du produit');
      return;
    }
    
    toast.success('Produit ajouté !');
    fetchProducts();
  };

  const handleUpdateProduct = async (
    productId: string,
    data: Partial<Omit<Product, 'id' | 'createdAt'>>,
    file?: File | null
  ) => {
    let finalImageUrl = data.imageUrl;
    if (file) {
      try {
        // Clean up old image from storage if it exists
        const oldProduct = products.find(p => p.id === productId);
        if (oldProduct?.imageUrl && oldProduct.imageUrl.includes('/storage/v1/object/public/products/')) {
          const oldPath = oldProduct.imageUrl.split('/storage/v1/object/public/products/')[1];
          if (oldPath) {
            await supabase.storage.from('products').remove([decodeURIComponent(oldPath)]);
          }
        }
        finalImageUrl = await uploadImage(file);
      } catch { toast.error('Erreur upload image.'); return; }
    }
    
    const { error } = await supabase.from('products').update({
      name: data.name,
      price: data.price,
      stock_count: data.stock,
      category: data.category,
      description: data.description,
      image: finalImageUrl
    }).eq('id', productId);
    
    if (error) {
      toast.error('Erreur de modification');
      return;
    }
    
    toast.success('Produit modifié !');
    setEditingProduct(null);
    fetchProducts();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer ce produit ?')) return;
    
    // Nettoyer l'image du produit dans le stockage Supabase si elle existe
    const productToDelete = products.find(p => p.id === id);
    if (productToDelete?.imageUrl && productToDelete.imageUrl.includes('/storage/v1/object/public/products/')) {
      const imagePath = productToDelete.imageUrl.split('/storage/v1/object/public/products/')[1];
      if (imagePath) {
        await supabase.storage.from('products').remove([decodeURIComponent(imagePath)]);
      }
    }
    
    await supabase.from('products').delete().eq('id', id);
    setProducts(products.filter(p => p.id !== id));
    toast.success('Produit supprimé');
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto space-y-12">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-art-border pb-6 gap-6">
        <h1 className="text-4xl font-serif italic tracking-tight text-art-text">Mes Produits</h1>
        <div className="w-full md:w-72 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-art-muted" />
          </div>
          <input
            type="text"
            placeholder="Rechercher un produit..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 glass-surface border border-art-border focus:outline-none focus:border-art-text text-sm transition-colors"
          />
        </div>
      </header>

      <ProductForm userCategories={userCategories} onAdd={handleAddProduct} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-art-muted" />
          </div>
        ) : products.length === 0 ? (
          <div className="col-span-full py-12 text-center text-art-muted text-sm italic font-serif">Aucun produit pour le moment.</div>
        ) : filteredProducts.length === 0 ? (
          <div className="col-span-full py-12 text-center text-art-muted text-sm italic font-serif">
            Aucun produit trouvé pour la recherche "{searchQuery}".
          </div>
        ) : (
          filteredProducts.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={setEditingProduct}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          userCategories={userCategories}
          onClose={() => setEditingProduct(null)}
          onSave={handleUpdateProduct}
        />
      )}
    </div>
  );
}