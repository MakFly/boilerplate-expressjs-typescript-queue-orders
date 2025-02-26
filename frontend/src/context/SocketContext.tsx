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
        
        // Gérer les différents types de messages
        switch (data.type) {
          case 'notification':
            handleNotification(data.data);
            break;
          case 'stock:notification':
            handleStockNotification(data.data);
            break;
          case 'order:new':
            handleNewOrder(data.data);
            break;
          case 'order:updated':
            handleOrderUpdated(data.data);
            break;
          case 'order:status':
            handleOrderStatus(data.data);
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
    // Afficher la notification visuelle à l'utilisateur
    showNotification(
      notification.message,
      getSeverityType(notification.severity)
    );
    
    // Déclencher un événement personnalisé pour que les composants puissent réagir
    window.dispatchEvent(createStockNotificationEvent(notification));
    
    // Invalider les requêtes liées aux notifications pour forcer un rechargement
    queryClient.invalidateQueries(['notifications', 'recent']);
    queryClient.invalidateQueries(['notifications', 'unread-count']);
  };

  const handleNewOrder = (order: Order) => {
    showNotification(`Nouvelle commande reçue: #${order.orderNumber}`, 'info');
    // Invalider les requêtes pour forcer un rechargement des données
    queryClient.invalidateQueries(['orders']);
    queryClient.invalidateQueries(['orders', 'list']);
    queryClient.invalidateQueries(['orders', 'stats']);
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
    // Notification spéciale pour les commandes confirmées
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