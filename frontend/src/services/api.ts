import axios from 'axios';
import { Order, OrderStatus } from '../types';
import { getQueryClient } from '../utils/queryClient';
import { toast } from 'sonner';

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
    
    // Gérer les erreurs 400 (Bad Request) et 500 (Internal Server Error) et afficher le message d'erreur
    if (error.response && error.response.data) {
      const errorData = error.response.data;
      
      // Extraire les détails spécifiques de l'erreur si disponibles
      let errorMessage = errorData.message || "Une erreur s'est produite";
      
      // Formater les messages d'erreur de stock insuffisant pour une meilleure lisibilité
      if (errorMessage.includes('Stock insuffisant')) {
        // Extraire les informations du message d'erreur
        const match = errorMessage.match(/Stock insuffisant pour le produit (.+) \(stock actuel: (\d+), quantité demandée: (\d+)\)/);
        if (match) {
          const [_, productName, stockActuel, quantiteDemandee] = match;
          errorMessage = `Stock insuffisant pour "${productName}"\nStock disponible: ${stockActuel}\nQuantité demandée: ${quantiteDemandee}`;
        }
      }
      
      // Formater les messages d'erreur de route non trouvée
      if (errorMessage.includes('Route non trouvée')) {
        // Vérifier le corps de la requête pour déterminer l'action tentée
        if (errorData.details && errorData.details.body) {
          const requestBody = errorData.details.body;
          
          // Si le corps contient un statut, c'est probablement une mise à jour de statut
          if (requestBody.status) {
            errorMessage = `Impossible de mettre à jour le statut de la commande. L'API n'est pas disponible.`;
          } else {
            errorMessage = `L'opération a échoué. L'API n'est pas disponible.`;
          }
        } else {
          errorMessage = `L'opération a échoué. L'API n'est pas disponible.`;
        }
      }
      
      // Vérifier si nous avons des détails supplémentaires
      if (errorData.details) {
        console.log("Détails de l'erreur:", errorData.details);
      }
      
      // Utiliser la fonction globale showNotification si elle existe
      if (window.showNotification) {
        window.showNotification(errorMessage, 'error');
      }
    }
    
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Fonction utilitaire pour extraire l'ID d'une commande à partir de différentes structures de réponse
export const extractOrderId = (data: any): string | null => {
  if (!data) return null;
  
  // Vérifier les différentes possibilités d'emplacement de l'ID
  if (data.id) return data.id;
  if (data.orderId) return data.orderId;
  if (data.order && data.order.id) return data.order.id;
  if (data.data && data.data.id) return data.data.id;
  if (data.data && data.data.order && data.data.order.id) return data.data.order.id;
  
  return null;
};

// Service pour les produits
export const productService = {
  // Récupérer tous les produits
  async getProducts() {
    const response = await api.get('/products');
    // Adapter la structure de réponse de l'API
    if (response.data && response.data.success && response.data.data) {
      return response.data.data;
    }
    return response.data;
  },

  // Récupérer un produit par son ID
  async getProductById(id: string) {
    const response = await api.get(`/products/${id}`);
    // Adapter la structure de réponse de l'API
    if (response.data && response.data.success && response.data.data) {
      return response.data.data;
    }
    return response.data;
  },

  // Créer un nouveau produit (admin seulement)
  async createProduct(productData) {
    const response = await api.post('/products', productData);
    // Adapter la structure de réponse de l'API
    if (response.data && response.data.success && response.data.data) {
      return response.data.data;
    }
    return response.data;
  },

  // Mettre à jour un produit (admin seulement)
  async updateProduct(id: string, productData) {
    const response = await api.put(`/products/${id}`, productData);
    // Adapter la structure de réponse de l'API
    if (response.data && response.data.success && response.data.data) {
      return response.data.data;
    }
    return response.data;
  },

  // Supprimer un produit (admin seulement)
  async deleteProduct(id: string) {
    const response = await api.delete(`/products/${id}`);
    return response.status === 204;
  }
};

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
    try {
      console.log(`Récupération de la commande avec ID: ${id}`);
      
      if (!id) {
        console.error('Erreur: ID de commande manquant');
        if (window.showNotification) {
          window.showNotification('Erreur: ID de commande manquant', 'error');
        }
        throw new Error('ID de commande manquant');
      }
      
      // Vérifier si la commande est déjà dans le cache
      const queryClient = getQueryClient();
      if (queryClient) {
        const cachedOrder = queryClient.getQueryData(['orders', 'detail', id]);
        if (cachedOrder) {
          console.log('Commande trouvée dans le cache:', cachedOrder);
          return cachedOrder as Order;
        }
      }
      
      const response = await api.get(`/orders/${id}`);
      console.log(`Réponse API pour la commande ${id}:`, response.data);
      
      // Adapter la structure de réponse de l'API
      if (response.data && response.data.success && response.data.data) {
        const order = response.data.data;
        
        // Vérifier que l'ID de la commande correspond à celui demandé
        const orderId = extractOrderId(order);
        if (orderId && orderId !== id) {
          console.warn(`L'ID de la commande retournée (${orderId}) ne correspond pas à l'ID demandé (${id})`);
        }
        
        // Mettre à jour le cache
        if (queryClient) {
          queryClient.setQueryData(['orders', 'detail', id], order);
        }
        
        return order;
      }
      
      return response.data;
    } catch (error) {
      console.error(`Erreur lors de la récupération de la commande ${id}:`, error);
      
      // Afficher une notification d'erreur
      if (window.showNotification) {
        const errorMessage = error.response?.data?.message || 'Erreur lors de la récupération de la commande';
        window.showNotification(errorMessage, 'error');
      }
      
      throw error;
    }
  },

  // Créer une nouvelle commande
  async createOrder(orderData) {
    try {
      const response = await api.post('/orders', orderData);
      
      // Vérifier si la réponse contient les données attendues
      if (response.data && response.data.success && response.data.data) {
        // La structure de la réponse peut être différente selon l'API
        // Vérifier si les données sont dans response.data.data.order ou directement dans response.data.data
        let createdOrder;
        
        if (response.data.data.order) {
          // Si la commande est dans un sous-objet 'order'
          createdOrder = response.data.data.order;
        } else {
          // Sinon, utiliser directement les données
          createdOrder = response.data.data;
        }
        
        // Extraire l'ID de la commande
        const orderId = extractOrderId(createdOrder);
        
        // Vérifier que l'ID de la commande est bien présent
        if (!orderId) {
          console.error('Erreur: ID de commande manquant dans la réponse API', response.data);
          if (window.showNotification) {
            window.showNotification('Erreur lors de la création de la commande: ID manquant', 'error');
          }
          throw new Error('ID de commande manquant dans la réponse API');
        }
        
        console.log('Commande créée avec succès, ID:', orderId);
        
        // Mettre à jour le cache local immédiatement
        try {
          const queryClient = getQueryClient();
          if (queryClient) {
            // Ajouter la commande au cache
            queryClient.setQueryData(['orders', 'detail', orderId], createdOrder);
            
            // Mettre à jour la liste des commandes
            queryClient.setQueryData(['orders', 'list'], (oldData: any) => {
              if (!oldData || !Array.isArray(oldData)) return [createdOrder];
              return [createdOrder, ...oldData];
            });
            
            // Invalider les requêtes pour forcer un rechargement
            queryClient.invalidateQueries(['orders']);
            queryClient.invalidateQueries(['orders', 'stats']);
          }
        } catch (cacheError) {
          console.error('Erreur lors de la mise à jour du cache local:', cacheError);
        }
        
        // Notification de succès
        if (window.showNotification) {
          window.showNotification(response.data.message || 'Commande créée avec succès', 'success');
        }
        
        // Retourner un objet avec l'ID de la commande facilement accessible
        return {
          ...createdOrder,
          id: orderId, // S'assurer que l'ID est accessible directement
          orderId: orderId // Fournir aussi orderId pour la compatibilité
        };
      }
      
      // Si la structure est différente, essayer d'extraire l'ID
      if (response.data && response.data.data) {
        const data = response.data.data;
        const orderId = extractOrderId(data);
        
        if (orderId) {
          console.log('ID de commande extrait:', orderId);
          return {
            ...data,
            id: orderId,
            orderId: orderId
          };
        }
      }
      
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la création de la commande:', error);
      
      let errorMessage = 'Erreur lors de la création de la commande';
      
      if (error.response && error.response.data) {
        const errorData = error.response.data;
        
        if (errorData.message) {
          errorMessage = errorData.message;
          
          // Si l'erreur concerne un stock insuffisant
          if (errorMessage.includes('Stock insuffisant')) {
            // Extraire les informations sur le produit et le stock
            const stockMatch = errorMessage.match(/Stock insuffisant pour le produit (.+) \(stock actuel: (\d+), quantité demandée: (\d+)\)/);
            
            if (stockMatch) {
              const [_, productName, stockActuel, quantiteDemandee] = stockMatch;
              
              // Formater le message d'erreur pour l'affichage
              errorMessage = `Produit en rupture de stock : "${productName}"
Stock disponible : ${stockActuel}
Quantité demandée : ${quantiteDemandee}`;
            }
          }
        }
        
        // Utiliser la fonction globale showNotification si elle existe
        if (window.showNotification) {
          window.showNotification(errorMessage, 'error');
        }
      }
      
      // Propager l'erreur pour qu'elle soit gérée par le composant
      throw error;
    }
  },

  // Mettre à jour le statut d'une commande
  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
    try {
      const response = await api.patch(`/orders/${id}/status`, { status });
      
      // Mettre à jour le cache local immédiatement
      try {
        const queryClient = getQueryClient();
        if (queryClient) {
          // Mettre à jour la commande dans le cache détaillé
          queryClient.setQueryData(['orders', 'detail', id], (oldData: any) => {
            if (!oldData) return response.data.data || response.data;
            return { ...oldData, status };
          });
          
          // Mettre à jour la commande dans la liste des commandes
          queryClient.setQueryData(['orders', 'list'], (oldData: any) => {
            if (!oldData || !Array.isArray(oldData)) return oldData;
            return oldData.map((order: any) => 
              order.id === id ? { ...order, status } : order
            );
          });
          
          // Déclencher un événement pour informer les composants que le statut a été mis à jour
          window.dispatchEvent(new CustomEvent('order:status-updated', { 
            detail: { id, status } 
          }));
        }
      } catch (error) {
        console.error('Erreur lors de la mise à jour du cache local:', error);
      }
      
      // Adapter la structure de réponse de l'API
      if (response.data && response.data.success && response.data.data) {
        return {
          ...response.data.data,
          message: response.data.message || 'Statut de la commande mis à jour'
        };
      }
      return response.data;
    } catch (error) {
      // En cas d'erreur de route non trouvée, essayer de mettre à jour le cache local quand même
      // pour améliorer l'expérience utilisateur
      if (error.response?.data?.message?.includes('Route non trouvée')) {
        try {
          const queryClient = getQueryClient();
          if (queryClient) {
            // Mettre à jour la commande dans le cache détaillé
            queryClient.setQueryData(['orders', 'detail', id], (oldData: any) => {
              if (!oldData) return null;
              return { ...oldData, status };
            });
            
            // Mettre à jour la commande dans la liste des commandes
            queryClient.setQueryData(['orders', 'list'], (oldData: any) => {
              if (!oldData || !Array.isArray(oldData)) return oldData;
              return oldData.map((order: any) => 
                order.id === id ? { ...order, status } : order
              );
            });
            
            // Déclencher un événement pour informer les composants que le statut a été mis à jour
            window.dispatchEvent(new CustomEvent('order:status-updated', { 
              detail: { id, status } 
            }));
            
            console.log(`Cache mis à jour localement pour la commande ${id} avec le statut ${status} malgré l'erreur d'API`);
          }
        } catch (cacheError) {
          console.error('Erreur lors de la mise à jour du cache local après erreur d\'API:', cacheError);
        }
      }
      
      // Propager l'erreur pour qu'elle soit gérée par le composant
      throw error;
    }
  },

  // Ajouter une note à une commande
  async addOrderNote(id: string, note: string): Promise<Order> {
    const response = await api.post(`/orders/${id}/notes`, { note });
    // Adapter la structure de réponse de l'API
    if (response.data && response.data.success && response.data.data) {
      return {
        ...response.data.data,
        message: response.data.message || 'Note ajoutée avec succès'
      };
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
      
      // Mettre à jour le cache local immédiatement
      try {
        const queryClient = getQueryClient();
        if (queryClient) {
          // Mettre à jour la commande dans le cache détaillé
          queryClient.setQueryData(['orders', 'detail', id], (oldData: any) => {
            if (!oldData) return response.data.data || response.data;
            return { ...oldData, status: 'CONFIRMED' };
          });
          
          // Mettre à jour la commande dans la liste des commandes
          queryClient.setQueryData(['orders', 'list'], (oldData: any) => {
            if (!oldData || !Array.isArray(oldData)) return oldData;
            return oldData.map((order: any) => 
              order.id === id ? { ...order, status: 'CONFIRMED' } : order
            );
          });
          
          // Déclencher un événement pour informer les composants que le statut a été mis à jour
          window.dispatchEvent(new CustomEvent('order:status-updated', { 
            detail: { id, status: 'CONFIRMED' } 
          }));
        }
      } catch (error) {
        console.error('Erreur lors de la mise à jour du cache local:', error);
      }
      
      // Adapter la structure de réponse de l'API
      if (response.data && response.data.success && response.data.data) {
        return {
          ...response.data.data,
          message: response.data.message || 'Commande validée avec succès'
        };
      }
      return response.data;
    } catch (error) {
      // Gérer spécifiquement les erreurs de stock insuffisant
      if (error.response?.data?.message?.includes('Stock insuffisant')) {
        const errorMessage = error.response.data.message;
        console.error('Erreur de stock insuffisant:', errorMessage);
        
        // Extraire les informations du message d'erreur pour un affichage plus convivial
        const match = errorMessage.match(/Stock insuffisant pour le produit (.+) \(stock actuel: (\d+), quantité demandée: (\d+)\)/);
        if (match) {
          const [_, productName, stockActuel, quantiteDemandee] = match;
          const formattedMessage = `Stock insuffisant pour "${productName}"\nStock disponible: ${stockActuel}\nQuantité demandée: ${quantiteDemandee}`;
          
          // Remplacer le message d'erreur par notre version formatée
          if (error.response && error.response.data) {
            error.response.data.message = formattedMessage;
          }
          
          // Mettre automatiquement la commande en CANCELLED
          try {
            console.log(`Annulation automatique de la commande ${id} en raison du stock insuffisant`);
            
            // Mettre à jour le cache local pour refléter l'annulation
            const queryClient = getQueryClient();
            if (queryClient) {
              // Mettre à jour la commande dans le cache détaillé
              queryClient.setQueryData(['orders', 'detail', id], (oldData: any) => {
                if (!oldData) return null;
                return { ...oldData, status: 'CANCELLED' };
              });
              
              // Mettre à jour la commande dans la liste des commandes
              queryClient.setQueryData(['orders', 'list'], (oldData: any) => {
                if (!oldData || !Array.isArray(oldData)) return oldData;
                return oldData.map((order: any) => 
                  order.id === id ? { ...order, status: 'CANCELLED' } : order
                );
              });
              
              // Déclencher un événement pour informer les composants que le statut a été mis à jour
              window.dispatchEvent(new CustomEvent('order:status-updated', { 
                detail: { id, status: 'CANCELLED' } 
              }));
            }
          } catch (cancelError) {
            console.error('Erreur lors de l\'annulation automatique:', cancelError);
          }
        }
      }
      // En cas d'erreur de route non trouvée, essayer de mettre à jour le cache local quand même
      else if (error.response?.data?.message?.includes('Route non trouvée')) {
        try {
          const queryClient = getQueryClient();
          if (queryClient) {
            // Mettre à jour la commande dans le cache détaillé
            queryClient.setQueryData(['orders', 'detail', id], (oldData: any) => {
              if (!oldData) return null;
              return { ...oldData, status: 'CONFIRMED' };
            });
            
            // Mettre à jour la commande dans la liste des commandes
            queryClient.setQueryData(['orders', 'list'], (oldData: any) => {
              if (!oldData || !Array.isArray(oldData)) return oldData;
              return oldData.map((order: any) => 
                order.id === id ? { ...order, status: 'CONFIRMED' } : order
              );
            });
            
            // Déclencher un événement pour informer les composants que le statut a été mis à jour
            window.dispatchEvent(new CustomEvent('order:status-updated', { 
              detail: { id, status: 'CONFIRMED' } 
            }));
            
            console.log(`Cache mis à jour localement pour la commande ${id} avec le statut CONFIRMED malgré l'erreur d'API`);
          }
        } catch (cacheError) {
          console.error('Erreur lors de la mise à jour du cache local après erreur d\'API:', cacheError);
        }
      }
      
      // Propager l'erreur pour qu'elle soit gérée par le composant
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
      
      // Déclencher un événement pour informer les autres composants
      window.dispatchEvent(new CustomEvent('notification:read', { detail: { id } }));
      
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

  // Marquer toutes les notifications comme lues (en réalité, les supprimer)
  async markAllNotificationsAsRead() {
    try {
      const response = await api.post('/stock-alerts/notifications/mark-all-read');
      
      // Déclencher un événement pour informer les autres composants
      // et vider complètement les notifications
      window.dispatchEvent(new CustomEvent('notification:all-read'));
      
      // Adapter la structure de réponse de l'API
      if (response.data && response.data.success) {
        return response.data;
      }
      return null;
    } catch (error) {
      console.error('Erreur lors de la suppression des notifications:', error);
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

  // Récupérer l'historique complet des notifications (y compris celles marquées comme lues)
  async getNotificationsHistory(limit = 50, offset = 0) {
    try {
      const response = await api.get(`/stock-alerts/notifications/history?limit=${limit}&offset=${offset}`);
      
      // Adapter la structure de réponse de l'API
      if (response.data && response.data.success) {
        return {
          data: response.data.data || [],
          pagination: response.data.pagination || { total: 0, limit, offset }
        };
      }
      return { data: [], pagination: { total: 0, limit, offset } };
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'historique des notifications:', error);
      return { data: [], pagination: { total: 0, limit, offset } };
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