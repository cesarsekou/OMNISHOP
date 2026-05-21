-- 1. Table des Utilisateurs (Marchands)
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  store_name TEXT,
  store_url TEXT UNIQUE,
  store_description TEXT,
  theme_color TEXT DEFAULT '#000000',
  background_color TEXT DEFAULT '#ffffff',
  text_color TEXT DEFAULT '#111111',
  hero_image TEXT,
  whatsapp_number TEXT,
  subscription_plan TEXT DEFAULT 'free',
  subscription_valid_until TIMESTAMPTZ,
  delivery_cost NUMERIC DEFAULT 1000,
  categories TEXT[] DEFAULT '{}',
  country TEXT DEFAULT 'CI',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Activer RLS pour les utilisateurs
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Les profils de boutiques sont publics" ON public.users FOR SELECT USING (true);
CREATE POLICY "Les marchands modifient leur propre profil" ON public.users FOR UPDATE USING (auth.uid() = id);

-- Trigger pour créer automatiquement une entrée dans public.users quand un utilisateur s'inscrit via l'Auth Supabase
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, store_url)
  VALUES (new.id, 'store-' || substr(md5(random()::text), 1, 8));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 2. Table des Produits
CREATE TABLE public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  image TEXT,
  category TEXT,
  description TEXT,
  in_stock BOOLEAN DEFAULT true,
  stock_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Activer RLS pour les produits
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Les produits sont publics" ON public.products FOR SELECT USING (true);
CREATE POLICY "Les marchands gèrent leurs produits" ON public.products FOR ALL USING (auth.uid() = user_id);


-- 3. Table des Commandes
CREATE TABLE public.orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT,
  items JSONB NOT NULL, -- Stocke le tableau des produits achetés
  total NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, cancelled
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Activer RLS pour les commandes
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tout le monde peut créer une commande" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Tout le monde peut voir les commandes pour le suivi" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Les marchands modifient leurs propres commandes" ON public.orders FOR UPDATE USING (auth.uid() = user_id);

-- Activer le temps réel pour les commandes dans Supabase
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;


-- 4. Configuration du Storage (Stockage des images)
INSERT INTO storage.buckets (id, name, public) VALUES ('products', 'products', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "Tout le monde peut voir les images" ON storage.objects FOR SELECT USING ( bucket_id IN ('products', 'avatars') );
CREATE POLICY "Les marchands peuvent uploader des images" ON storage.objects FOR INSERT WITH CHECK ( auth.role() = 'authenticated' );
CREATE POLICY "Les marchands modifient leurs images" ON storage.objects FOR UPDATE USING ( auth.uid() = owner );
CREATE POLICY "Les marchands suppriment leurs images" ON storage.objects FOR DELETE USING ( auth.uid() = owner );


-- 5. Fonction RPC pour décrémenter le stock atomiquement (Prévient les Race Conditions)
CREATE OR REPLACE FUNCTION public.decrement_stock(product_id UUID, quantity INT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.products
  SET stock_count = GREATEST(0, stock_count - quantity)
  WHERE id = product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. Table des Paiements (Suivi et Réconciliation)
CREATE TABLE public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  tx_ref TEXT UNIQUE NOT NULL,
  transaction_id TEXT, -- ID de transaction Flutterwave
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'XOF',
  plan_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, success, failed, pending_verification
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Activer RLS pour les paiements
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Les marchands voient leurs propres paiements" ON public.payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Les marchands insèrent leurs propres paiements" ON public.payments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Les marchands mettent à jour leurs paiements" ON public.payments FOR UPDATE USING (auth.uid() = user_id);

-- Activer le temps réel pour les paiements dans Supabase
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
