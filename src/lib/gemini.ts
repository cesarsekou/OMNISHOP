import { GoogleGenAI } from "@google/genai";

// Initialisation du client Google Gen AI avec la clé d'API de l'environnement
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export interface AIProduct {
  name: string;
  price: number;
  description: string;
  category: string;
  imageIndex: number;
}

export interface AIStoreResult {
  storeName: string;
  storeDescription: string;
  storeSlug: string;
  themeId: 'elegant' | 'nature' | 'mode' | 'tech';
  categories: string[];
  products: AIProduct[];
}

/**
 * Convertit un fichier en format Part attendu par l'API Gemini
 */
const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type
        }
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Génère la configuration de la boutique et les fiches produits à partir d'une description textuelle
 * et éventuellement de photos de produits chargées par l'utilisateur.
 */
export async function generateStoreFromDescription(
  prompt: string,
  imageFiles: File[]
): Promise<AIStoreResult> {
  if (!ai) {
    throw new Error(
      "La clé d'API Gemini (VITE_GEMINI_API_KEY) n'est pas configurée dans les variables d'environnement (.env)."
    );
  }

  try {
    // Conversion des fichiers images en format supporté par le modèle (base64 inlineData)
    const imageParts = await Promise.all(imageFiles.map(fileToGenerativePart));

    const contents = [
      ...imageParts,
      `L'utilisateur souhaite créer sa boutique en ligne par commande vocale/textuelle.
      
      Demande textuelle : "${prompt}"
      
      Analyse cette demande ainsi que les ${imageFiles.length} photo(s) produit jointe(s). 
      Génère le nom de la boutique, une description vendeuse, le thème visuel idéal, les catégories de produits, 
      et les fiches produits associées à chaque image (en reliant l'image à son index 0-indexed).`
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: contents,
      config: {
        systemInstruction: `Tu es un assistant e-commerce hautement qualifié pour l'Afrique francophone (Côte d'Ivoire, Sénégal, Cameroun, Mali, etc.).
        Ta mission est d'analyser la description textuelle du marchand et les photos de ses produits pour configurer de manière optimale sa boutique en ligne de façon entièrement automatisée.
        
        Règles de génération strictes :
        1. Nom de boutique ('storeName') : Trouve un nom accrocheur, élégant, mémorable et adapté (en français).
        2. Description de boutique ('storeDescription') : Rédige une description professionnelle de 2-3 phrases décrivant l'activité, les produits et invitant le client à commander sur WhatsApp.
        3. Lien boutique ('storeSlug') : Génère un slug propre (lettres minuscules sans accent et tirets uniquement) basé sur le nom.
        4. Thème ('themeId') : Choisis impérativement l'une de ces 4 valeurs exactes :
           - 'nature' : Produits cosmétiques, naturels, bio, bien-être, alimentation, plantes.
           - 'mode' : Prêt-à-porter, vêtements, chaussures, sacs, bijoux de fantaisie.
           - 'tech' : Électronique, téléphones, accessoires de bureau, gadgets.
           - 'elegant' : Parfums de luxe, haute couture, maquillage premium, joaillerie haut de gamme.
        5. Catégories ('categories') : Propose 2 à 4 catégories de produits logiques sous forme d'un tableau de chaînes (ex: ["Soins Visage", "Sérums Hydratants"]).
        6. Produits ('products') : Analyse les images pour créer des fiches produits de grande qualité.
           - S'il y a des images fournies, crée obligatoirement un produit pour chaque image, en renseignant 'imageIndex' avec l'index de l'image (de 0 à N-1).
           - Si l'utilisateur n'a pas fourni d'images ou a écrit des idées de produits dans sa demande, tu peux générer 1 à 3 produits additionnels en renseignant 'imageIndex' à -1.
           - 'name' : Nom clair du produit en français.
           - 'price' : Suggère un prix réaliste en FCFA adapté au marché africain (ex: 5000, 15000, 20000, 35000). Utilise uniquement des entiers (pas de centimes).
           - 'description' : Une description alléchante et professionnelle du produit.
           - 'category' : Associe le produit à l'une des catégories créées ci-dessus.
           
        Sois extrêmement professionnel, chaleureux et persuasif. Le résultat final doit sembler avoir été fait par une agence de design premium.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            storeName: { type: 'STRING' },
            storeDescription: { type: 'STRING' },
            storeSlug: { type: 'STRING' },
            themeId: { 
              type: 'STRING',
              description: 'Doit être uniquement elegant, nature, mode, ou tech'
            },
            categories: {
              type: 'ARRAY',
              items: { type: 'STRING' }
            },
            products: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  name: { type: 'STRING' },
                  price: { type: 'INTEGER' },
                  description: { type: 'STRING' },
                  category: { type: 'STRING' },
                  imageIndex: { 
                    type: 'INTEGER',
                    description: "L'index de l'image dans la liste fournie (0-indexed). Mettre -1 si aucune image ne correspond directement."
                  }
                },
                required: ['name', 'price', 'description', 'category', 'imageIndex']
              }
            }
          },
          required: ['storeName', 'storeDescription', 'storeSlug', 'themeId', 'categories', 'products']
        }
      }
    });

    if (!response.text) {
      throw new Error("Réponse vide reçue de l'API Gemini.");
    }

    const result = JSON.parse(response.text) as AIStoreResult;
    return result;
  } catch (error: any) {
    console.error("Gemini Generation Error:", error);
    throw new Error(
      error.message || "Une erreur est survenue lors de la génération de la boutique avec l'IA."
    );
  }
}
