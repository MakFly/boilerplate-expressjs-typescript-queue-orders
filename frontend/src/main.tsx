import React, { StrictMode } from 'react';
import { createRoot } from "react-dom/client";
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { SocketProvider } from './context/SocketContext';
import { toast } from 'sonner';
import App from './App';
import './styles/globals.css';
import { ThemeProvider } from './components/theme-provider';

// Fonction de notification qui utilise sonner
const handleNotification = (message: string, severity: 'success' | 'info' | 'warning' | 'error') => {
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

// Ajouter la fonction showNotification à l'objet window pour qu'elle soit accessible globalement
declare global {
  interface Window {
    showNotification: (message: string, severity: 'success' | 'info' | 'warning' | 'error') => void;
  }
}

window.showNotification = handleNotification;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SocketProvider showNotification={handleNotification}>
          <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
            <App />
          </ThemeProvider>
        </SocketProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);