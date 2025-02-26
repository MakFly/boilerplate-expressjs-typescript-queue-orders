import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import OrdersList from './pages/OrdersList';
import OrderDetails from './pages/OrderDetails';
import CreateOrder from './pages/CreateOrder';
import Login from './pages/Login';
import Admin from './pages/Admin';
import NotificationsHistory from './pages/NotificationsHistory';
import Layout from './components/common/Layout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import { useAuthStore } from './store/authStore';
import { toast } from 'sonner';

const App: React.FC = () => {
  const { isAuthenticated, checkAuth } = useAuthStore();
  const [isInitialized, setIsInitialized] = useState(false);
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';
  
  // Vérifier l'authentification au chargement de l'application
  useEffect(() => {
    const initAuth = async () => {
      console.log('Initializing authentication...');
      try {
        const isAuthenticated = await checkAuth();
        console.log('Authentication check result:', isAuthenticated);
        setIsInitialized(true);
      } catch (error) {
        console.error('Authentication check failed:', error);
        setIsInitialized(true);
      }
    };
    
    initAuth();
  }, [checkAuth]);

  // Fonction pour afficher des notifications avec sonner
  const showNotification = (message: string, severity: 'success' | 'info' | 'warning' | 'error') => {
    // Ne pas afficher de notifications sur la page de login
    if (isLoginPage) return;
    
    // Filtrer les notifications pour n'afficher que celle avec la référence de commande
    // lorsqu'il s'agit d'une confirmation de commande
    if (message.includes('validée avec succès') && !message.includes('#')) {
      return; // Ne pas afficher cette notification
    }
    
    // Filtrer les notifications dupliquées pour les commandes confirmées
    // Si on a déjà une notification avec # pour une commande confirmée, ne pas afficher les autres
    if (message.includes('confirmée avec succès') && !message.includes('#')) {
      return; // Ne pas afficher cette notification
    }
    
    // Utiliser la fonction toast de sonner avec les options appropriées
    switch (severity) {
      case 'success':
        toast.success(message);
        break;
      case 'error':
        toast.error(message);
        break;
      case 'warning':
        toast.warning(message);
        break;
      case 'info':
      default:
        toast.info(message);
        break;
    }
  };

  // Exposer la fonction showNotification au contexte SocketProvider
  useEffect(() => {
    // Mettre à jour la fonction showNotification dans le contexte global si nécessaire
    window.showNotification = showNotification;
  }, [isLoginPage]);

  if (!isInitialized) {
    // Afficher un écran de chargement pendant la vérification de l'authentification
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Ajouter le Toaster au niveau de l'application pour les pages qui n'utilisent pas le Layout */}
      {isAuthenticated ? (
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute><OrdersList /></ProtectedRoute>} />
            <Route path="/orders/create" element={<ProtectedRoute><CreateOrder /></ProtectedRoute>} />
            <Route path="/orders/:id" element={<ProtectedRoute><OrderDetails /></ProtectedRoute>} />
            <Route path="/products" element={<ProtectedRoute><div>Page Produits (à venir)</div></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute><div>Page Utilisateurs (à venir)</div></ProtectedRoute>} />
            <Route path="/notifications/history" element={<ProtectedRoute><NotificationsHistory /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><div>Page Paramètres (à venir)</div></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      ) : (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
    </div>
  );
}

// Ajouter la déclaration pour TypeScript
declare global {
  interface Window {
    showNotification: (message: string, severity: 'success' | 'info' | 'warning' | 'error') => void;
  }
}

export default App; 