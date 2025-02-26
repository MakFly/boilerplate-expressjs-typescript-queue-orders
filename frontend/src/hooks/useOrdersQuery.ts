import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orderService } from '../services/api';
import { Order, OrderStatus } from '../types';

// Clés de query pour les différentes requêtes
export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (filters: string) => [...orderKeys.lists(), { filters }] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
  stats: () => [...orderKeys.all, 'stats'] as const,
};

// Hook pour récupérer toutes les commandes
export const useOrdersQuery = () => {
  return useQuery({
    queryKey: orderKeys.lists(),
    queryFn: () => orderService.getOrders(),
  });
};

// Hook pour récupérer une commande par son ID
export const useOrderQuery = (id: string) => {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => orderService.getOrderById(id),
    enabled: !!id, // Ne pas exécuter la requête si l'ID est vide
  });
};

// Hook pour récupérer les statistiques des commandes
export const useOrderStatsQuery = () => {
  return useQuery({
    queryKey: orderKeys.stats(),
    queryFn: () => orderService.getOrderStats(),
  });
};

// Hook pour mettre à jour le statut d'une commande
export const useUpdateOrderStatusMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) => 
      orderService.updateOrderStatus(id, status),
    onSuccess: (data, variables) => {
      // Mettre à jour la commande dans le cache
      queryClient.setQueryData(
        orderKeys.detail(variables.id),
        data
      );
      
      // Invalider la liste des commandes pour forcer un rechargement
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      
      // Invalider les statistiques pour forcer un rechargement
      queryClient.invalidateQueries({ queryKey: orderKeys.stats() });
    },
  });
};

// Hook pour ajouter une note à une commande
export const useAddOrderNoteMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => 
      orderService.addOrderNote(id, note),
    onSuccess: (data, variables) => {
      // Mettre à jour la commande dans le cache
      queryClient.setQueryData(
        orderKeys.detail(variables.id),
        data
      );
    },
  });
}; 