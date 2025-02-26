import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { orderService } from '../services/api';
import { Order, OrderStats, OrderContextType, OrderStatus, UserRole } from '../types';
import { useAuthStore } from '../store/authStore';

const initialStats: OrderStats = {
  total: 0,
  new: 0,
  processing: 0,
  completed: 0,
  cancelled: 0,
  todayOrders: 0,
  todayRevenue: 0,
  weeklyRevenue: 0,
};

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export const useOrders = () => {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error('useOrders must be used within an OrderProvider');
  }
  return context;
};

interface OrderProviderProps {
  children: ReactNode;
}

export const OrderProvider: React.FC<OrderProviderProps> = ({ children }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats>(initialStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuthStore();

  // Ajouter des logs détaillés pour le débogage
  console.log('User dans OrderContext:', user);
  console.log('User role:', user?.role);
  console.log('UserRole.ADMIN:', UserRole.ADMIN);
  console.log('Type de user.role:', user?.role ? typeof user.role : 'undefined');
  console.log('Comparaison stricte:', user?.role === UserRole.ADMIN);

  // Vérifier si l'utilisateur a le rôle admin ou manager en utilisant l'enum
  // L'enum UserRole garantit que la comparaison est exacte et évite les problèmes de casse
  const hasAdminAccess = user && (
    user.role === UserRole.ADMIN || 
    user.role === UserRole.MANAGER
  );
  
  console.log('hasAdminAccess:', hasAdminAccess);

  const fetchOrders = async () => {
    // Si l'utilisateur n'a pas les droits, ne pas faire l'appel API
    if (!hasAdminAccess) {
      setOrders([]);
      setLoading(false);
      setError("Vous n'avez pas les droits nécessaires pour accéder aux commandes");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await orderService.getOrders();
      setOrders(data);
      await fetchStats();
    } catch (err: any) {
      if (err.response && err.response.status === 403) {
        setError("Vous n'avez pas les droits nécessaires pour accéder aux commandes");
      } else {
        setError('Erreur lors du chargement des commandes');
      }
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    // Si l'utilisateur n'a pas les droits, utiliser des statistiques vides
    if (!hasAdminAccess) {
      setStats(initialStats);
      return;
    }

    try {
      const data = await orderService.getOrderStats();
      setStats(data);
    } catch (err: any) {
      console.error('Error fetching order stats:', err);
      // En cas d'erreur, utiliser des statistiques vides
      setStats(initialStats);
    }
  };

  const fetchOrderById = async (id: string): Promise<Order | null> => {
    // Si l'utilisateur n'a pas les droits, ne pas faire l'appel API
    if (!hasAdminAccess) {
      setError("Vous n'avez pas les droits nécessaires pour accéder à cette commande");
      return null;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await orderService.getOrderById(id);
      return data;
    } catch (err: any) {
      if (err.response && err.response.status === 403) {
        setError("Vous n'avez pas les droits nécessaires pour accéder à cette commande");
      } else {
        setError(`Erreur lors du chargement de la commande ${id}`);
      }
      console.error(`Error fetching order ${id}:`, err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (id: string, status: OrderStatus): Promise<boolean> => {
    // Si l'utilisateur n'a pas les droits, ne pas faire l'appel API
    if (!hasAdminAccess) {
      setError("Vous n'avez pas les droits nécessaires pour modifier cette commande");
      return false;
    }

    try {
      setLoading(true);
      setError(null);
      await orderService.updateOrderStatus(id, status);
      
      // Mettre à jour l'ordre localement
      setOrders(orders.map(order => 
        order.id === id ? { ...order, status } : order
      ));
      
      // Mettre à jour les statistiques
      await fetchStats();
      
      return true;
    } catch (err: any) {
      if (err.response && err.response.status === 403) {
        setError("Vous n'avez pas les droits nécessaires pour modifier cette commande");
      } else {
        setError(`Erreur lors de la mise à jour du statut de la commande ${id}`);
      }
      console.error(`Error updating order ${id} status:`, err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const addOrderNote = async (id: string, note: string): Promise<boolean> => {
    // Si l'utilisateur n'a pas les droits, ne pas faire l'appel API
    if (!hasAdminAccess) {
      setError("Vous n'avez pas les droits nécessaires pour modifier cette commande");
      return false;
    }

    try {
      setLoading(true);
      setError(null);
      const updatedOrder = await orderService.addOrderNote(id, note);
      
      // Mettre à jour l'ordre localement
      setOrders(orders.map(order => 
        order.id === id ? updatedOrder : order
      ));
      
      return true;
    } catch (err: any) {
      if (err.response && err.response.status === 403) {
        setError("Vous n'avez pas les droits nécessaires pour modifier cette commande");
      } else {
        setError(`Erreur lors de l'ajout d'une note à la commande ${id}`);
      }
      console.error(`Error adding note to order ${id}:`, err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [user]); // Refetch when user changes

  return (
    <OrderContext.Provider
      value={{
        orders,
        stats,
        loading,
        error,
        fetchOrders,
        fetchOrderById,
        updateOrderStatus,
        addOrderNote,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}; 