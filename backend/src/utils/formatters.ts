/**
 * Formate un numéro de commande avec le préfixe et le padding appropriés
 * @param orderNumber Numéro de commande à formater
 * @returns Numéro de commande formaté
 */
export function formatOrderNumber(orderNumber: number): string {
  return `ORD-${orderNumber.toString().padStart(8, '0')}`;
}

/**
 * Formate un prix en devise (EUR par défaut)
 * @param price Prix à formater
 * @param currency Devise (EUR par défaut)
 * @returns Prix formaté
 */
export function formatPrice(price: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
  }).format(price);
} 