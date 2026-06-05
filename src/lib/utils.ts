import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { COUNTRIES } from "../data/countries"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formate un numéro de téléphone pour l'envoi WhatsApp.
 * - Supprime tous les caractères non numériques (espaces, tirets, parenthèses, +)
 * - Si le numéro ne commence pas déjà par l'indicatif pays, l'ajoute automatiquement.
 * - Retourne le numéro formaté au format E.164 sans le "+", ex: "2250757535379"
 */
export function formatPhoneForWhatsApp(phone: string, countryCode: string = 'CI'): string {
  const countryData = COUNTRIES[countryCode];
  // Extraire uniquement les chiffres du préfixe, ex: "+225" => "225"
  const prefix = countryData?.phonePrefix?.replace(/[^0-9]/g, '') || '225';
  
  // Supprimer tous les caractères non numériques du numéro saisi
  const digitsOnly = phone.replace(/[^0-9]/g, '');
  
  // Si le numéro commence déjà par l'indicatif pays, ne pas le rajouter
  if (digitsOnly.startsWith(prefix)) {
    return digitsOnly;
  }
  
  // Si le numéro commence par un "0" local (ex: 0757535379 -> 757535379)
  const localNumber = digitsOnly.startsWith('0') ? digitsOnly.slice(1) : digitsOnly;
  
  return `${prefix}${localNumber}`;
}
