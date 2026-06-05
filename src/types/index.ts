export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  imageUrl?: string; // Frontend property mapped from 'image'
  image?: string;    // Database property alias
  category?: string;
  stock: number;      // Frontend property mapped from 'stock_count'
  stock_count?: number; // Database property alias
  createdAt?: string;
}

export interface StoreData {
  id: string;           // UUID du marchand dans la table users
  store_name: string;
  store_url: string;
  store_description?: string;
  categories?: string[];
  theme_color?: string;
  background_color?: string;
  text_color?: string;
  hero_image?: string;
  whatsapp_number?: string;
  subscription_plan?: 'free' | 'essential' | 'pro';
  subscription_valid_until?: string; // ISO 8601 string (Supabase TIMESTAMPTZ)
  delivery_cost?: number;
  country?: string;
}

export interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  items: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
    imageUrl?: string;
  }>;
  total: number;
  status: 'pending' | 'processing' | 'shipping' | 'completed' | 'cancelled';
  createdAt: any;
  deliveryMethod: 'delivery' | 'pickup';
  deliveryAddress?: string;
}
