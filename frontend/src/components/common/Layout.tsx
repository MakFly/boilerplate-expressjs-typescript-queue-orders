import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import { useAuthStore } from '../../store/authStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { orderService, stockService } from '../../services/api';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

// Importation des icônes avec la nouvelle syntaxe pour Heroicons v2
import { 
  Bars3Icon, 
  HomeIcon, 
  ShoppingCartIcon, 
  BellIcon, 
  Cog6ToothIcon, 
  ArrowRightOnRectangleIcon, 
  ShoppingBagIcon, 
  UsersIcon,
  WifiIcon,
  XMarkIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import { ModeToggle } from '../../components/mode-toggle';
import { Toaster } from '../ui/sonner';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

const drawerWidth = 240;

interface LayoutProps {
  children?: React.ReactNode;
}

// Interface pour les notifications d'alerte de stock
interface StockAlertNotification {
  id: string;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: string;
  read: boolean;
  productName?: string;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState<StockAlertNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [notificationHistory, setNotificationHistory] = useState<StockAlertNotification[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { connected } = useSocket();
  const { logout, isAuthenticated, user } = useAuthStore();
  const queryClient = useQueryClient();
  
  // Récupérer les statistiques des commandes avec TanStack Query
  const { data: orderStats = { new: 0 } } = useQuery(['orders', 'stats'], () => orderService.getOrderStats(), {
    // Ne pas exécuter la requête si l'utilisateur n'a pas les droits
    enabled: !!user && (user.role === 'ADMIN' || user.role === 'MANAGER'),
  });

  // Amélioration: Utiliser useQuery avec unreadCount pour avoir un compteur distinct
  const { data: unreadCountData } = useQuery(
    ['notifications', 'unread-count'],
    () => stockService.getUnreadNotificationsCount(),
    {
      enabled: !!user && (user.role === 'ADMIN' || user.role === 'MANAGER'),
      refetchInterval: 15000, // Rafraîchir toutes les 15 secondes
    }
  );

  // Récupérer les notifications récentes
  const { data: stockNotifications = [], refetch: refetchNotifications } = useQuery(
    ['notifications', 'recent'],
    () => stockService.getRecentNotifications(),
    {
      enabled: !!user && (user.role === 'ADMIN' || user.role === 'MANAGER'),
      refetchInterval: 30000, // Rafraîchir toutes les 30 secondes
    }
  );

  // Récupérer l'historique des notifications
  const { data: historyResponse = { data: [] }, refetch: refetchHistory } = useQuery(
    ['notifications', 'history'],
    () => stockService.getNotificationsHistory(100, 0),
    {
      enabled: !!user && (user.role === 'ADMIN' || user.role === 'MANAGER') && showHistory,
      // Ne pas rafraîchir automatiquement l'historique
    }
  );

  // Extraire les notifications de l'historique
  const historyNotifications = historyResponse.data || [];

  // Mettre à jour l'état des notifications quand les données sont récupérées
  useEffect(() => {
    if (stockNotifications.length > 0) {
      setNotifications(stockNotifications);
    }
  }, [stockNotifications]);

  // Mettre à jour le compteur d'alertes non lues à partir de la requête dédiée
  useEffect(() => {
    if (unreadCountData !== undefined) {
      setUnreadCount(unreadCountData);
    }
  }, [unreadCountData]);

  // Mettre à jour l'état de l'historique des notifications
  useEffect(() => {
    if (historyNotifications.length > 0) {
      setNotificationHistory(historyNotifications);
    }
  }, [historyNotifications]);

  // Écouter les événements WebSocket pour les notifications en temps réel
  useEffect(() => {
    // Cette fonction sera appelée chaque fois qu'une nouvelle notification arrive via WebSocket
    const handleNewNotification = (event: CustomEvent) => {
      // Récupérer la notification depuis l'événement
      const notification = event.detail;
      console.log('Notification reçue dans Layout:', notification);
      
      // Mettre à jour l'état local des notifications immédiatement
      setNotifications(prev => {
        // Vérifier si la notification existe déjà pour éviter les doublons
        const exists = prev.some(n => n.id === notification.id);
        if (exists) return prev;
        return [notification, ...prev];
      });
      
      // Mettre à jour le compteur d'alertes non lues immédiatement
      setUnreadCount(prev => prev + 1);
      
      // Rafraîchir les données avec une priorité élevée
      refetchNotifications();
      
      // Si la notification est critique ou haute, rafraîchir également les données des commandes et produits
      if (notification.severity === 'CRITICAL' || notification.severity === 'HIGH') {
        queryClient.invalidateQueries(['orders'], {
          refetchType: 'active',
          refetchActive: true
        });
        queryClient.invalidateQueries(['products'], {
          refetchType: 'active',
          refetchActive: true
        });
      }
    };

    // Fonction pour gérer le marquage d'une notification comme lue
    const handleNotificationRead = (event: CustomEvent) => {
      const { id } = event.detail;
      
      // Mettre à jour l'état local immédiatement
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === id ? { ...notif, read: true } : notif
        )
      );
      
      // Mettre à jour le compteur immédiatement
      setUnreadCount(prev => Math.max(0, prev - 1));
    };

    // Fonction pour gérer le marquage de toutes les notifications comme lues
    const handleAllNotificationsRead = () => {
      // Vider complètement les notifications immédiatement
      setNotifications([]);
      
      // Réinitialiser le compteur immédiatement
      setUnreadCount(0);
      
      // Rafraîchir les données
      refetchNotifications();
      refetchHistory();
    };

    // Ajouter les écouteurs d'événements
    window.addEventListener('stock:notification', handleNewNotification as EventListener);
    window.addEventListener('notification:read', handleNotificationRead as EventListener);
    window.addEventListener('notification:all-read', handleAllNotificationsRead as EventListener);

    return () => {
      // Nettoyer les écouteurs lors du démontage du composant
      window.removeEventListener('stock:notification', handleNewNotification as EventListener);
      window.removeEventListener('notification:read', handleNotificationRead as EventListener);
      window.removeEventListener('notification:all-read', handleAllNotificationsRead as EventListener);
    };
  }, [refetchNotifications, refetchHistory, queryClient]);

  // Ajouter un effet pour rafraîchir périodiquement les notifications
  useEffect(() => {
    // Rafraîchir les notifications toutes les 5 secondes si l'utilisateur a les droits
    const interval = setInterval(() => {
      if (user && (user.role === 'ADMIN' || user.role === 'MANAGER')) {
        refetchNotifications();
        queryClient.invalidateQueries(['notifications', 'unread-count']);
      }
    }, 5000); // Réduire l'intervalle à 5 secondes pour plus de réactivité

    return () => clearInterval(interval);
  }, [refetchNotifications, queryClient, user]);

  // Vérifier si l'utilisateur a le rôle admin ou manager
  const hasAdminAccess = user && (user.role === 'ADMIN' || user.role === 'MANAGER');

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  // Menu items de base pour tous les utilisateurs
  const baseMenuItems = [
    { text: 'Tableau de bord', icon: <HomeIcon className="h-6 w-6" aria-hidden="true" />, path: '/' },
  ];
  
  // Menu items pour les administrateurs et managers
  const adminMenuItems = hasAdminAccess ? [
    { 
      text: 'Commandes', 
      icon: <ShoppingCartIcon className="h-6 w-6" aria-hidden="true" />, 
      path: '/orders',
      badge: orderStats.new > 0 ? orderStats.new : null
    },
    { 
      text: 'Produits', 
      icon: <ShoppingBagIcon className="h-6 w-6" aria-hidden="true" />, 
      path: '/products'
    },
    { 
      text: 'Utilisateurs', 
      icon: <UsersIcon className="h-6 w-6" aria-hidden="true" />, 
      path: '/users'
    },
    { 
      text: 'Historique des notifications', 
      icon: <BellIcon className="h-6 w-6" aria-hidden="true" />, 
      path: '/notifications/history'
    },
  ] : [];
  
  // Combiner les menus
  const menuItems = [...baseMenuItems, ...adminMenuItems];

  // Marquer une notification comme lue
  const markAsRead = async (id: string) => {
    try {
      await stockService.markNotificationAsRead(id);
      // La mise à jour locale est gérée par les écouteurs d'événements
    } catch (error) {
      console.error('Erreur lors du marquage de la notification comme lue', error);
    }
  };

  // Supprimer toutes les notifications
  const markAllAsRead = async () => {
    try {
      await stockService.markAllNotificationsAsRead();
      
      // Vider complètement les notifications
      setNotifications([]);
      setUnreadCount(0);
      
      // Invalider les requêtes pour forcer un rechargement
      queryClient.invalidateQueries(['notifications', 'recent']);
      queryClient.invalidateQueries(['notifications', 'unread-count']);
      queryClient.invalidateQueries(['notifications', 'history']);
      
      if (window.showNotification) {
        window.showNotification('Toutes les notifications ont été supprimées', 'success');
      }
    } catch (error) {
      console.error('Erreur lors de la suppression des notifications', error);
    }
  };

  // Basculer entre les notifications récentes et l'historique
  const toggleHistory = () => {
    setShowHistory(!showHistory);
    if (!showHistory) {
      // Si on active l'historique, on le rafraîchit
      refetchHistory();
    }
  };

  // Obtenir la couleur en fonction de la sévérité
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-600';
      case 'HIGH': return 'bg-orange-500';
      case 'MEDIUM': return 'bg-yellow-500';
      case 'LOW': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const drawer = (
    <div className="h-full">
      <div className="flex items-center justify-between p-4 h-16">
        <h6 className="text-lg font-medium text-foreground">Admin Dashboard</h6>
        <button 
          className="md:hidden text-muted-foreground hover:text-foreground"
          onClick={handleDrawerToggle}
        >
          <XMarkIcon className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
      <div className="border-t border-border"></div>
      <nav className="mt-2">
        <ul>
          {menuItems.map((item) => (
            <li key={item.text}>
              <button 
                className={`flex items-center w-full px-4 py-2 text-left ${
                  location.pathname === item.path 
                    ? 'bg-accent text-primary' 
                    : 'text-foreground hover:bg-accent/50'
                }`}
                onClick={() => {
                  navigate(item.path);
                  setMobileOpen(false);
                }}
              >
                <span className="mr-3 text-muted-foreground">
                  {item.badge ? (
                    <div className="relative">
                      {item.icon}
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                        {item.badge}
                      </span>
                    </div>
                  ) : (
                    item.icon
                  )}
                </span>
                <span>{item.text}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="border-t border-border mt-4"></div>
      <nav className="mt-2">
        <ul>
          <li>
            <button className="flex items-center w-full px-4 py-2 text-left text-foreground hover:bg-accent/50">
              <span className="mr-3 text-muted-foreground">
                <Cog6ToothIcon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span>Paramètres</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNewOrder = (order: Order) => {
    // Vérifier que l'ordre contient un numéro de commande
    const orderNumber = order.orderNumber || order.id?.substring(0, 8).toUpperCase() || 'UNKNOWN';
    
    console.log('Nouvelle commande reçue via WebSocket:', order);
    
    // Afficher une notification plus détaillée
    showNotification(
      `Nouvelle commande reçue: #${orderNumber} - ${order.items || 'N/A'} article(s) - ${order.totalAmount?.toFixed(2) || 'N/A'} €`, 
      'info'
    );
    
    // Invalider les requêtes pour forcer un rechargement des données
    queryClient.invalidateQueries(['orders']);
    queryClient.invalidateQueries(['orders', 'list']);
    queryClient.invalidateQueries(['orders', 'stats']);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar pour desktop */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-[80] bg-background border-r border-border">
        {drawer}
      </aside>

      {/* Sidebar mobile */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm" onClick={handleDrawerToggle}>
          <div className="fixed inset-y-0 left-0 w-64 bg-background border-r border-border" onClick={(e) => e.stopPropagation()}>
            {drawer}
          </div>
        </div>
      )}

      {/* Contenu principal */}
      <div className="flex flex-col flex-1 md:pl-64">
        {/* Barre de navigation supérieure */}
        <header className="sticky top-0 z-40 flex h-16 items-center border-b bg-background px-4 sm:px-6">
          <button
            className="md:hidden text-muted-foreground hover:text-foreground"
            onClick={handleDrawerToggle}
          >
            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
          </button>

          <div className="flex-1" />

          {/* Partie droite de la navbar */}
          <div className="flex items-center space-x-4">
            {/* Notifications */}
            {hasAdminAccess && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="relative p-1 rounded-full text-foreground hover:bg-accent focus:outline-none">
                    <BellIcon className="h-6 w-6" aria-hidden="true" />
                    {unreadCount > 0 && (
                      <span className="absolute top-0 right-0 block h-4 w-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-96 p-0">
                  <div className="p-3 border-b border-border flex justify-between items-center">
                    <h3 className="font-medium">Alertes de stock</h3>
                    <div className="flex space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={toggleHistory}
                        className={showHistory ? 'bg-accent' : ''}
                      >
                        {showHistory ? 'Récentes' : 'Historique'}
                      </Button>
                      {!showHistory && notifications.length > 0 && unreadCount > 0 && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={markAllAsRead}
                        >
                          Tout supprimer
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-primary scrollbar-track-accent">
                    {showHistory ? (
                      notificationHistory.length > 0 ? (
                        notificationHistory.map((notification) => (
                          <div 
                            key={notification.id} 
                            className="p-4 border-b border-border opacity-70"
                          >
                            <div className="flex items-start">
                              <Badge className={`${getSeverityColor(notification.severity)} mr-3 whitespace-nowrap`}>
                                {notification.severity}
                              </Badge>
                              <div className="flex-1">
                                <p className="text-sm font-medium">{notification.message}</p>
                                {notification.productName && (
                                  <p className="text-xs text-muted-foreground mt-1">Produit: {notification.productName}</p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(notification.timestamp).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center">
                          <BellIcon className="h-10 w-10 mb-2 text-muted-foreground/50" />
                          <p>Aucun historique disponible</p>
                          <p className="text-xs mt-1">L'historique des notifications est vide</p>
                        </div>
                      )
                    ) : (
                      notifications.length > 0 ? (
                        notifications.map((notification) => (
                          <div 
                            key={notification.id} 
                            className={`p-4 border-b border-border ${notification.read ? 'opacity-70' : 'bg-accent/20'}`}
                            onClick={() => !notification.read && markAsRead(notification.id)}
                          >
                            <div className="flex items-start">
                              <Badge className={`${getSeverityColor(notification.severity)} mr-3 whitespace-nowrap`}>
                                {notification.severity}
                              </Badge>
                              <div className="flex-1">
                                <p className="text-sm font-medium">{notification.message}</p>
                                {notification.productName && (
                                  <p className="text-xs text-muted-foreground mt-1">Produit: {notification.productName}</p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(notification.timestamp).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center">
                          <BellIcon className="h-10 w-10 mb-2 text-muted-foreground/50" />
                          <p>Aucune notification</p>
                          <p className="text-xs mt-1">Vous êtes à jour !</p>
                        </div>
                      )
                    )}
                  </div>
                  <div className="p-2 border-t border-border">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full text-center"
                      onClick={() => {
                        navigate('/notifications/history');
                      }}
                    >
                      Voir l'historique complet
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Mode toggle */}
            <ModeToggle />
            
            {/* Bouton Test Theme */}
            <button 
              className="px-2 py-1 bg-primary text-primary-foreground rounded-md text-sm"
              onClick={() => {
                const root = window.document.documentElement;
                console.log("Current HTML classes:", root.classList);
                console.log("Has dark class:", root.classList.contains("dark"));
              }}
            >
              Test Theme
            </button>
            
            {/* Indicateur de connexion */}
            {connected ? (
              <WifiIcon className="h-5 w-5 text-green-500" aria-hidden="true" />
            ) : (
              <WifiIcon className="h-5 w-5 text-red-500" aria-hidden="true" />
            )}
            
            {/* Bouton de déconnexion */}
            {isAuthenticated && (
              <button 
                className="flex items-center px-3 py-1 text-foreground hover:bg-accent rounded"
                onClick={handleLogout}
              >
                <ArrowRightOnRectangleIcon className="h-5 w-5 mr-1" aria-hidden="true" />
                <span>Déconnexion</span>
              </button>
            )}
          </div>
        </header>

        {/* Contenu de la page */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 relative">
          <Outlet />
          
          {/* Bouton flottant pour créer une nouvelle commande */}
          {location.pathname !== '/orders/create' && (
            <button
              onClick={() => navigate('/orders/create')}
              className="fixed bottom-6 right-6 p-4 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors z-50"
              aria-label="Créer une nouvelle commande"
            >
              <PlusIcon className="h-6 w-6" />
            </button>
          )}
        </main>
      </div>
    </div>
  );
};

export default Layout; 