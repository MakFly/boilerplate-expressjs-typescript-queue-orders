import { queryClient } from '../lib/queryClient';

/**
 * Fonction utilitaire pour accéder à l'instance QueryClient depuis n'importe où dans l'application
 * Cela permet de mettre à jour le cache en dehors des composants React
 */
export const getQueryClient = () => {
  return queryClient;
}; 