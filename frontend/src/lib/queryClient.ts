import { QueryClient } from '@tanstack/react-query';

// Créer une instance de QueryClient avec des options par défaut
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Réessayer 1 fois en cas d'échec
      retry: 1,
      // Considérer les données comme périmées après 5 minutes
      staleTime: 5 * 60 * 1000,
      // Garder les données en cache pendant 10 minutes
      gcTime: 10 * 60 * 1000,
      // Afficher les erreurs dans la console
      onError: (error) => {
        console.error('Query error:', error);
      },
    },
    mutations: {
      // Ne pas réessayer les mutations en cas d'échec
      retry: false,
      // Afficher les erreurs dans la console
      onError: (error) => {
        console.error('Mutation error:', error);
      },
    },
  },
}); 