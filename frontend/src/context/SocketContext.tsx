import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Order, NotificationProps } from '../types';
import { queryClient } from '../lib/queryClient';

interface SocketContextProps extends NotificationProps {
  children: ReactNode;
}

interface SocketContextValue {
  connected: boolean;
  reconnect: () => void;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

// Créer un événement personnalisé pour les notifications de stock
const createStockNotificationEvent = (notification: any) => {
  return new CustomEvent('stock:notification', { detail: notification });
};

export const SocketProvider: React.FC<SocketContextProps> = ({ children, showNotification }) => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  const setupSocket = () => {
    // Utiliser le protocole ws:// ou wss:// selon le protocole actuel (http ou https)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;
    
    const newSocket = new WebSocket(wsUrl);

    newSocket.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
      showNotification('Connexion au serveur établie', 'success');
      
      // S'abonner aux notifications importantes
      const subscriptions = ['all', 'critical', 'high', 'stock'];
      subscriptions.forEach(channel => {
        newSocket.send(JSON.stringify({
          type: 'subscribe',
          channel
        }));
      });
    };

    newSocket.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      showNotification('Connexion au serveur perdue', 'error');
    };

    newSocket.onerror = (error) => {
      console.error('WebSocket connection error:', error);
      setConnected(false);
    };

    newSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Message WebSocket reçu:', data.type);
        
        // Gérer les différents types de messages
        switch (data.type) {
          case 'notification':
            // Traitement prioritaire des notifications
            setTimeout(() => {
              handleNotification(data.data);
              // Forcer le rafraîchissement des données de notification
              queryClient.invalidateQueries(['notifications', 'recent'], { 
                refetchType: 'active',
                refetchActive: true,
                refetchInactive: false
              });
              queryClient.invalidateQueries(['notifications', 'unread-count'], { 
                refetchType: 'active',
                refetchActive: true,
                refetchInactive: false
              });
            }, 0);
            break;
          case 'stock:notification':
            // Traitement prioritaire des notifications de stock
            setTimeout(() => {
              handleStockNotification(data.data);
            }, 0);
            break;
          case 'order:new':
            // Traitement prioritaire des nouvelles commandes
            setTimeout(() => {
              handleNewOrder(data.data);
            }, 0);
            break;
          case 'order:updated':
            handleOrderUpdated(data.data);
            break;
          case 'order:status':
            handleOrderStatus(data.data);
            break;
          case 'recent_notifications':
            // Mise à jour immédiate du cache des notifications récentes
            queryClient.setQueryData(['notifications', 'recent'], data.data);
            break;
          case 'notification:all-read':
            // Déclencher un événement pour informer les composants que toutes les notifications ont été supprimées
            window.dispatchEvent(new CustomEvent('notification:all-read'));
            // Invalider les requêtes liées aux notifications pour forcer un rechargement
            queryClient.invalidateQueries(['notifications', 'history']);
            queryClient.invalidateQueries(['notifications', 'recent']);
            queryClient.invalidateQueries(['notifications', 'unread-count']);
            break;
          default:
            console.log('Message reçu:', data);
        }
      } catch (error) {
        console.error('Erreur lors du traitement du message WebSocket:', error);
      }
    };

    setSocket(newSocket);

    return newSocket;
  };

  // Gestionnaires d'événements
  const handleNotification = (data: any) => {
    showNotification(data.message, data.severity.toLowerCase());
  };
  
  // Nouveau gestionnaire spécifique pour les notifications de stock
  const handleStockNotification = (notification: any) => {
    console.log('Notification de stock reçue:', notification);
    
    // Mettre à jour immédiatement le cache des notifications récentes
    // Cette approche est plus rapide que d'attendre une requête réseau
    try {
      const currentNotifications = queryClient.getQueryData(['notifications', 'recent']) || [];
      queryClient.setQueryData(['notifications', 'recent'], [notification, ...currentNotifications]);
      
      // Incrémenter le compteur de notifications non lues
      const currentCount = queryClient.getQueryData(['notifications', 'unread-count']) || 0;
      queryClient.setQueryData(['notifications', 'unread-count'], currentCount + 1);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du cache des notifications:', error);
    }
    
    // Afficher la notification visuelle à l'utilisateur
    showNotification(
      notification.message,
      getSeverityType(notification.severity)
    );
    
    // Déclencher un événement personnalisé pour que les composants puissent réagir immédiatement
    window.dispatchEvent(createStockNotificationEvent(notification));
    
    // Invalider les requêtes liées aux notifications avec une priorité élevée
    queryClient.invalidateQueries(['notifications', 'recent'], { 
      refetchType: 'active',
      refetchActive: true,
      refetchInactive: true
    });
    queryClient.invalidateQueries(['notifications', 'unread-count'], { 
      refetchType: 'active',
      refetchActive: true,
      refetchInactive: true
    });
    
    // Invalider également les requêtes liées aux produits et commandes si la notification est critique
    if (notification.severity === 'CRITICAL' || notification.severity === 'HIGH') {
      queryClient.invalidateQueries(['products'], {
        refetchType: 'active',
        refetchActive: true
      });
      queryClient.invalidateQueries(['orders'], {
        refetchType: 'active',
        refetchActive: true
      });
      
      // Si la notification contient un ID de produit, invalider spécifiquement ce produit
      if (notification.productId) {
        queryClient.invalidateQueries(['products', notification.productId], {
          refetchType: 'active',
          refetchActive: true
        });
      }
      
      // Si la notification contient un ID de commande, invalider spécifiquement cette commande
      if (notification.orderId) {
        queryClient.invalidateQueries(['orders', 'detail', notification.orderId], {
          refetchType: 'active',
          refetchActive: true
        });
      }
    }
  };

  const handleNewOrder = (order: Order) => {
    console.log('Nouvelle commande reçue via WebSocket:', order);
    
    // Vérifier que l'ordre contient un numéro de commande
    const orderNumber = order.orderNumber || order.id?.substring(0, 8).toUpperCase() || 'UNKNOWN';
    
    // Afficher une notification plus détaillée
    showNotification(
      `Nouvelle commande reçue: #${orderNumber} - ${order.items || 'N/A'} article(s) - ${order.totalAmount?.toFixed(2) || 'N/A'} €`, 
      'info'
    );
    
    // Invalider les requêtes pour forcer un rechargement immédiat des données
    queryClient.invalidateQueries(['orders'], {
      refetchType: 'active',
      refetchActive: true,
      refetchInactive: true
    });
    queryClient.invalidateQueries(['orders', 'list'], {
      refetchType: 'active',
      refetchActive: true
    });
    queryClient.invalidateQueries(['orders', 'stats'], {
      refetchType: 'active',
      refetchActive: true
    });
    
    // Vérifier si la commande contient des produits avec stock critique
    // et déclencher un rafraîchissement des notifications si nécessaire
    if (order.hasCriticalStock) {
      queryClient.invalidateQueries(['notifications', 'recent'], { 
        refetchType: 'active',
        refetchActive: true
      });
      queryClient.invalidateQueries(['notifications', 'unread-count'], { 
        refetchType: 'active',
        refetchActive: true
      });
    }
  };

  const handleOrderUpdated = (order: Order) => {
    showNotification(`Commande #${order.orderNumber} mise à jour`, 'info');
    // Invalider les requêtes pour forcer un rechargement des données
    queryClient.invalidateQueries(['orders']);
    queryClient.invalidateQueries(['orders', 'list']);
    queryClient.invalidateQueries(['orders', 'detail', order.id]);
    queryClient.invalidateQueries(['orders', 'stats']);
  };

  const handleOrderStatus = ({ orderNumber, status, orderId }: { orderNumber: string; status: string; orderId?: string }) => {
    // Notification spéciale pour les commandes confirmées avec numéro de référence
    if (status === 'CONFIRMED') {
      showNotification(`🎉 Commande #${orderNumber} confirmée avec succès!`, 'success');
    } else {
      showNotification(`Statut de la commande #${orderNumber} changé à ${status}`, 'info');
    }
    
    // Invalider les requêtes pour forcer un rechargement des données
    queryClient.invalidateQueries(['orders']);
    queryClient.invalidateQueries(['orders', 'list']);
    queryClient.invalidateQueries(['orders', 'stats']);
    
    // Si l'ID de la commande est disponible, invalider également les détails spécifiques
    if (orderId) {
      queryClient.invalidateQueries(['orders', 'detail', orderId]);
    }
  };

  // Utilitaire pour convertir les niveaux de sévérité en types de notification
  const getSeverityType = (severity: string): 'success' | 'info' | 'warning' | 'error' => {
    switch (severity) {
      case 'CRITICAL':
        return 'error';
      case 'HIGH':
        return 'warning';
      case 'MEDIUM':
        return 'info';
      case 'LOW':
        return 'success';
      default:
        return 'info';
    }
  };

  useEffect(() => {
    const newSocket = setupSocket();

    return () => {
      if (newSocket) {
        newSocket.close();
      }
    };
  }, []);

  const reconnect = () => {
    if (socket) {
      socket.close();
    }
    setupSocket();
  };

  return (
    <SocketContext.Provider value={{ connected, reconnect }}>
      {children}
    </SocketContext.Provider>
  );
}; 