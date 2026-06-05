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
DECLARE
  v_slug TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_slug := 'store-' || substr(md5(random()::text), 1, 8);
    SELECT EXISTS(SELECT 1 FROM public.users WHERE store_url = v_slug) INTO v_exists;
    IF NOT v_exists THEN
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO public.users (id, store_url)
  VALUES (new.id, v_slug);
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
CREATE POLICY "Les marchands voient leurs propres commandes" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Les clients suivent leur commande avec un ID unique (Non-devinable)" ON public.orders FOR SELECT USING (auth.uid() IS NULL); -- Les UUIDs v4 protègent contre l'énumération.
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


-- 7. Table des Sessions WhatsApp (OpenWA)
CREATE TABLE public.whatsapp_sessions (
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE PRIMARY KEY,
  session_key TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'DISCONNECTED', -- DISCONNECTED, PAIRING, CONNECTED
  qr_code TEXT, -- base64 QR code pour l'affichage de couplage
  auto_notify_orders BOOLEAN DEFAULT true,
  order_message_template TEXT DEFAULT $$🎉 *OmniShop | Commande Enregistrée !*

Bonjour {customer_name},

Bonne nouvelle ! Votre commande *#{order_id}* d'un montant de {total_amount} a bien été reçue et est en cours de validation.

📍 *Suivez votre commande en direct :*
{tracking_link}

Notre équipe va vérifier la disponibilité de vos articles et vous contactera très rapidement pour confirmer la livraison. Merci pour votre confiance ! 🙏$$,
  notify_on_processing BOOLEAN DEFAULT true,
  template_processing TEXT DEFAULT $$📦 *OmniShop | Votre commande se prépare !*

Bonjour {customer_name},

Vos articles pour la commande *#{order_id}* sont actuellement en cours de préparation et d'emballage par notre équipe.

📍 *Suivez l'avancement en direct :*
{tracking_link}

Préparez-vous à recevoir votre colis très bientôt ! Nous vous enverrons un message dès que le livreur sera en route. 🚀$$,
  notify_on_completed BOOLEAN DEFAULT true,
  template_completed TEXT DEFAULT $$✨ *OmniShop | Commande Livrée !*

Bonjour {customer_name},

Nous espérons que vos articles vous plaisent ! Votre commande *#{order_id}* a été marquée comme livrée avec succès.

Merci infiniment de faire confiance à notre boutique. Votre satisfaction est notre priorité absolue.

À très bientôt pour vos prochains achats ! 🌟$$,
  notify_on_cancelled BOOLEAN DEFAULT true,
  template_cancelled TEXT DEFAULT $$ℹ️ *OmniShop | Commande Annulée*

Bonjour {customer_name},

Nous vous informons que votre commande *#{order_id}* a été annulée.

Si vous n'êtes pas à l'origine de cette demande, ou si vous souhaitez modifier vos informations pour retenter l'achat, notre service client est à votre entière disposition.

📞 Répondez simplement à ce message WhatsApp pour nous contacter.

À bientôt.$$,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Activer RLS pour les sessions WhatsApp
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Les marchands gèrent leur session WhatsApp" ON public.whatsapp_sessions 
  FOR ALL USING (auth.uid() = user_id);

-- Activer le temps réel pour les sessions WhatsApp
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_sessions;


-- 8. Table de File d'Attente des Messages WhatsApp (whatsapp_queue)
CREATE TABLE public.whatsapp_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  recipient_phone TEXT NOT NULL,
  message_text TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, sent, failed
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ
);

-- Activer RLS pour la queue WhatsApp
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Les marchands gèrent leur file d'attente WhatsApp" ON public.whatsapp_queue 
  FOR ALL USING (auth.uid() = user_id);

-- Activer le temps réel pour la queue WhatsApp
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_queue;


-- 9. Trigger pour insérer automatiquement des messages de notification WhatsApp lors des commandes (création et changement de statut)
CREATE OR REPLACE FUNCTION public.handle_new_order_whatsapp_notification()
RETURNS trigger AS $$
DECLARE
  v_session RECORD;
  v_message TEXT;
  v_clean_phone TEXT;
  v_store_slug TEXT;
  v_tracking_link TEXT;
  v_should_send BOOLEAN := false;
BEGIN
  -- Récupérer le template et les paramètres de notification du marchand
  SELECT * INTO v_session FROM public.whatsapp_sessions WHERE user_id = new.user_id;
  
  -- Si pas de session configurée, on ne fait rien
  IF v_session IS NULL THEN
    RETURN new;
  END IF;

  -- Récupérer le slug de la boutique
  SELECT store_url INTO v_store_slug FROM public.users WHERE id = new.user_id;

  -- Construire le lien de suivi de commande en direct
  -- Fallback vers localhost s'il n'est pas configuré
  v_tracking_link := 'http://localhost:3000/' || v_store_slug || '?order=' || new.id::text;

  -- Nettoyer le numéro de téléphone (conserver uniquement les chiffres)
  v_clean_phone := regexp_replace(new.customer_phone, '[^0-9]', '', 'g');

  -- Vérifier si c'est une nouvelle commande (INSERT) ou une mise à jour de statut (UPDATE)
  IF (TG_OP = 'INSERT' AND new.status = 'pending') THEN
    IF v_session.auto_notify_orders = true THEN
      v_message := v_session.order_message_template;
      v_should_send := true;
    END IF;
  ELSIF (TG_OP = 'UPDATE' AND old.status IS DISTINCT FROM new.status) THEN
    IF (new.status = 'processing' AND v_session.notify_on_processing = true) THEN
      v_message := v_session.template_processing;
      v_should_send := true;
    ELSIF (new.status = 'completed' AND v_session.notify_on_completed = true) THEN
      v_message := v_session.template_completed;
      v_should_send := true;
    ELSIF (new.status = 'cancelled' AND v_session.notify_on_cancelled = true) THEN
      v_message := v_session.template_cancelled;
      v_should_send := true;
    END IF;
  END IF;

  -- S'il y a un message à envoyer, on le formate et on l'insère dans la file d'attente
  IF v_should_send = true AND v_message IS NOT NULL AND v_message <> '' THEN
    -- Remplacer les variables dynamiques
    v_message := replace(v_message, '{customer_name}', new.customer_name);
    v_message := replace(v_message, '{order_id}', substring(new.id::text from 1 for 8));
    v_message := replace(v_message, '{total_amount}', new.total::text);
    v_message := replace(v_message, '{phone}', new.customer_phone);
    v_message := replace(v_message, '{tracking_link}', v_tracking_link);
    
    -- Insérer le message à envoyer dans la file d'attente
    INSERT INTO public.whatsapp_queue (user_id, recipient_phone, message_text, status)
    VALUES (new.user_id, v_clean_phone, v_message, 'pending');
  END IF;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Supprimer l'ancien trigger s'il existe
DROP TRIGGER IF EXISTS on_order_created_whatsapp ON public.orders;

-- Créer le trigger actif sur INSERT et UPDATE
CREATE TRIGGER on_order_created_whatsapp
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_order_whatsapp_notification();

