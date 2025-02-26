import axios from 'axios';
import { Order, OrderStatus } from '../types';

const API_URL = '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Récupérer le token depuis le localStorage
const getAuthToken = () => {
  const authStorage = localStorage.getItem('auth-storage');
  if (authStorage) {
    try {
      const { state } = JSON.parse(authStorage);
      return state.token;
    } catch (error) {
      console.error('Erreur lors de la récupération du token:', error);
      return null;
    }
  }
  return null;
};

// Intercepteur pour ajouter le token JWT à chaque requête
api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Intercepteur pour gérer les erreurs
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Gérer les erreurs d'authentification (401)
    if (error.response && error.response.status === 401) {
      // Supprimer le token invalide du localStorage
      localStorage.removeItem('auth-storage');
      
      // Rediriger vers la page de connexion si le token est expiré ou invalide
      // Conserver l'URL actuelle pour rediriger après connexion
      const currentPath = window.location.pathname;
      if (currentPath !== '/login') {
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
      }
    }
    
    // Gérer les erreurs 400 (Bad Request) et afficher le message d'erreur
    if (error.response && error.response.status === 400 && error.response.data) {
      const errorData = error.response.data;
      // Utiliser la fonction globale showNotification si elle existe
      if (window.showNotification && errorData.message) {
        window.showNotification(errorData.message, 'error');
      }
    }
    
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export const orderService = {
  // Récupérer toutes les commandes
  async getOrders(): Promise<Order[]> {
    const response = await api.get('/orders');
    // Adapter la structure de réponse de l'API
    if (response.data && response.data.success && response.data.data) {
      return response.data.data;
    }
    return response.data;
  },

  // Récupérer une commande par son ID
  async getOrderById(id: string): Promise<Order> {
    const response = await api.get(`/orders/${id}`);
    // Adapter la structure de réponse de l'API
    if (response.data && response.data.success && response.data.data) {
      return response.data.data;
    }
    return response.data;
  },

  // Mettre à jour le statut d'une commande
  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
    const response = await api.patch(`/orders/${id}/status`, { status });
    // Adapter la structure de réponse de l'API
    if (response.data && response.data.success && response.data.data) {
      return response.data.data;
    }
    return response.data;
  },

  // Ajouter une note à une commande
  async addOrderNote(id: string, note: string): Promise<Order> {
    const response = await api.post(`/orders/${id}/notes`, { note });
    // Adapter la structure de réponse de l'API
    if (response.data && response.data.success && response.data.data) {
      return response.data.data;
    }
    return response.data;
  },

  // Récupérer les statistiques des commandes
  async getOrderStats() {
    console.log('Calling API: GET /orders/stats');
    try {
      const response = await api.get('/orders/stats');
      console.log('API response:', response);
      
      // Adapter la structure de réponse de l'API
      if (response.data && response.data.success && response.data.data) {
        return response.data.data;
      }
      
      // Si la structure est différente, retourner directement les données
      if (response.data) {
        console.log('Returning direct data:', response.data);
        return response.data;
      }
      
      // Si aucune donnée n'est disponible, retourner un objet vide avec la structure attendue
      console.warn('No data available, returning empty stats object');
      return {
        totalOrders: 0,
        ordersByStatus: [],
        totalAmount: 0,
        averageAmount: 0,
        topProducts: [],
        ordersByDay: []
      };
    } catch (error) {
      console.error('Error fetching order stats:', error);
      throw error;
    }
  },

  // Valider une commande
  async validateOrder(id: string): Promise<Order> {
    try {
      const response = await api.post(`/orders/${id}/validate`);
      // Adapter la structure de réponse de l'API
      if (response.data && response.data.success && response.data.data) {
        return response.data.data;
      }
      return response.data;
    } catch (error) {
      // L'intercepteur se chargera d'afficher les messages d'erreur
      console.error('Erreur lors de la validation de la commande:', error);
      throw error;
    }
  },
};

// Service pour gérer les alertes de stock
export const stockService = {
  // Récupérer les notifications récentes
  async getRecentNotifications(limit = 20) {
    try {
      const response = await api.get(`/stock-alerts/notifications/recent?limit=${limit}`);
      
      // Adapter la structure de réponse de l'API
      if (response.data && response.data.success && response.data.data) {
        return response.data.data;
      }
      return [];
    } catch (error) {
      console.error('Erreur lors de la récupération des notifications récentes:', error);
      return [];
    }
  },

  // Marquer une notification comme lue
  async markNotificationAsRead(id: string) {
    try {
      const response = await api.post(`/stock-alerts/notifications/${id}/read`);
      
      // Adapter la structure de réponse de l'API
      if (response.data && response.data.success) {
        return response.data;
      }
      return null;
    } catch (error) {
      console.error('Erreur lors du marquage de la notification comme lue:', error);
      throw error;
    }
  },

  // Marquer toutes les notifications comme lues
  async markAllNotificationsAsRead() {
    try {
      const response = await api.post('/stock-alerts/notifications/mark-all-read');
      
      // Adapter la structure de réponse de l'API
      if (response.data && response.data.success) {
        return response.data;
      }
      return null;
    } catch (error) {
      console.error('Erreur lors du marquage de toutes les notifications comme lues:', error);
      throw error;
    }
  },

  // Récupérer le nombre de notifications non lues
  async getUnreadNotificationsCount() {
    try {
      const response = await api.get('/stock-alerts/notifications/unread-count');
      
      // Adapter la structure de réponse de l'API
      if (response.data && response.data.success && response.data.data) {
        return response.data.data.count;
      }
      return 0;
    } catch (error) {
      console.error('Erreur lors de la récupération du nombre de notifications non lues:', error);
      return 0;
    }
  },

  // Récupérer les statistiques des alertes
  async getAlertStats() {
    try {
      const response = await api.get('/stock-alerts/stats');
      
      // Adapter la structure de réponse de l'API
      if (response.data && response.data.success && response.data.data) {
        return response.data.data;
      }
      return {
        totalAlerts: 0,
        criticalAlerts: 0,
        highAlerts: 0,
        alertsByType: [],
        alertsByProduct: []
      };
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques des alertes:', error);
      return {
        totalAlerts: 0,
        criticalAlerts: 0,
        highAlerts: 0,
        alertsByType: [],
        alertsByProduct: []
      };
    }
  }
};

export default api; 