import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import { useAuthStore } from '../../store/authStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { orderService, stockService } from '../../services/api';

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
  XMarkIcon
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

  // Écouter les événements WebSocket pour les notifications en temps réel
  useEffect(() => {
    // Cette fonction sera appelée chaque fois qu'une nouvelle notification arrive via WebSocket
    const handleNewNotification = () => {
      // Rafraîchir les données
      refetchNotifications();
      queryClient.invalidateQueries(['notifications', 'unread-count']);
    };

    // Ajouter l'écouteur global (à adapter selon votre implémentation WebSocket)
    window.addEventListener('stock:notification', handleNewNotification);

    return () => {
      // Nettoyer l'écouteur lors du démontage du composant
      window.removeEventListener('stock:notification', handleNewNotification);
    };
  }, [refetchNotifications, queryClient]);

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
  ] : [];
  
  // Combiner les menus
  const menuItems = [...baseMenuItems, ...adminMenuItems];

  // Marquer une notification comme lue
  const markAsRead = async (id: string) => {
    try {
      await stockService.markNotificationAsRead(id);
      // Mettre à jour localement
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === id ? { ...notif, read: true } : notif
        )
      );
      // Invalider les requêtes pour forcer un rechargement des compteurs
      queryClient.invalidateQueries(['notifications', 'unread-count']);
    } catch (error) {
      console.error('Erreur lors du marquage de la notification comme lue', error);
    }
  };

  // Marquer toutes les notifications comme lues
  const markAllAsRead = async () => {
    try {
      await stockService.markAllNotificationsAsRead();
      // Mettre à jour localement
      setNotifications(prev => 
        prev.map(notif => ({ ...notif, read: true }))
      );
      setUnreadCount(0);
      // Invalider les requêtes pour forcer un rechargement
      queryClient.invalidateQueries(['notifications', 'recent']);
      queryClient.invalidateQueries(['notifications', 'unread-count']);
      
      if (window.showNotification) {
        window.showNotification('Toutes les notifications ont été marquées comme lues', 'success');
      }
    } catch (error) {
      console.error('Erreur lors du marquage de toutes les notifications comme lues', error);
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

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar pour mobile */}
      <div 
        className={`fixed inset-0 z-40 md:hidden ${mobileOpen ? 'block' : 'hidden'}`}
        onClick={handleDrawerToggle}
      >
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75"></div>
      </div>
      
      <div 
        className={`fixed z-40 inset-y-0 left-0 w-64 transition duration-300 transform bg-card md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {drawer}
      </div>
      
      {/* Sidebar pour desktop */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64">
          <div className="flex flex-col h-0 flex-1 border-r border-border bg-card">
            {drawer}
          </div>
        </div>
      </div>
      
      {/* Contenu principal */}
      <div className="flex flex-col flex-1 w-0 overflow-hidden">
        <div className="relative z-10 flex-shrink-0 flex h-16 bg-card shadow">
          <button
            className="px-4 border-r border-border text-muted-foreground md:hidden"
            onClick={handleDrawerToggle}
          >
            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
          </button>
          
          <div className="flex-1 px-4 flex justify-between">
            <div className="flex-1 flex items-center">
              <h1 className="text-xl font-semibold text-foreground">Tableau de bord</h1>
            </div>
            
            <div className="ml-4 flex items-center md:ml-6">
              {/* Notifications d'alerte de stock */}
              {hasAdminAccess && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="mr-4 relative p-1 rounded-full text-foreground hover:bg-accent focus:outline-none">
                      <BellIcon className="h-6 w-6" aria-hidden="true" />
                      {unreadCount > 0 && (
                        <span className="absolute top-0 right-0 block h-4 w-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0">
                    <div className="p-2 border-b border-border flex justify-between items-center">
                      <h3 className="font-medium">Alertes de stock</h3>
                      {notifications.length > 0 && unreadCount > 0 && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={markAllAsRead}
                        >
                          Tout marquer comme lu
                        </Button>
                      )}
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                      {notifications.length > 0 ? (
                        notifications.map((notification) => (
                          <div 
                            key={notification.id} 
                            className={`p-3 border-b border-border ${notification.read ? 'opacity-70' : 'bg-accent/20'}`}
                            onClick={() => !notification.read && markAsRead(notification.id)}
                          >
                            <div className="flex items-start">
                              <Badge className={`${getSeverityColor(notification.severity)} mr-2`}>
                                {notification.severity}
                              </Badge>
                              <div className="flex-1">
                                <p className="text-sm">{notification.message}</p>
                                {notification.productName && (
                                  <p className="text-xs text-muted-foreground">Produit: {notification.productName}</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  {new Date(notification.timestamp).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-center text-muted-foreground">
                          Aucune notification
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              
              <div className="mr-3 flex items-center">
                <ModeToggle />
                <button 
                  className="ml-2 px-2 py-1 bg-primary text-primary-foreground rounded-md text-sm"
                  onClick={() => {
                    const root = window.document.documentElement;
                    console.log("Current HTML classes:", root.classList);
                    console.log("Has dark class:", root.classList.contains("dark"));
                  }}
                >
                  Test Theme
                </button>
              </div>
              {/* Indicateur de connexion */}
              <div className="mr-3 flex items-center">
                {connected ? (
                  <WifiIcon className="h-5 w-5 text-green-500" aria-hidden="true" />
                ) : (
                  <WifiIcon className="h-5 w-5 text-red-500" aria-hidden="true" />
                )}
              </div>
              
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
          </div>
        </div>
        
        <main className="flex-1 relative overflow-y-auto focus:outline-none p-6 bg-background">
          {children || <Outlet />}
          <Toaster />
        </main>
      </div>
    </div>
  );
};

export default Layout; 