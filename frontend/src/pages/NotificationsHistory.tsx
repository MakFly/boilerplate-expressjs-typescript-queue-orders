import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { stockService } from '../services/api';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from '../components/ui/pagination';
import { BellIcon } from '@heroicons/react/24/outline';

// Interface pour les notifications d'alerte de stock
interface StockAlertNotification {
  id: string;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: string;
  read: boolean;
  productName?: string;
}

// Interface pour la réponse de l'API
interface ApiResponse {
  data: StockAlertNotification[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

const NotificationsHistory: React.FC = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 20; // Nombre de notifications par page

  // Récupérer l'historique des notifications avec pagination
  const { data, isLoading, isError, refetch } = useQuery<ApiResponse>(
    ['notifications', 'history', currentPage],
    () => stockService.getNotificationsHistory(limit, (currentPage - 1) * limit),
    {
      keepPreviousData: true,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      staleTime: 10000, // Considérer les données comme périmées après 10 secondes
    }
  );

  // Mettre à jour le nombre total de pages
  useEffect(() => {
    if (data?.pagination?.total) {
      const total = Math.ceil(data.pagination.total / limit);
      setTotalPages(total || 1);
    }
  }, [data]);

  // Écouter l'événement notification:all-read pour rafraîchir les données
  useEffect(() => {
    const handleAllNotificationsRead = () => {
      // Rafraîchir les données lorsque toutes les notifications sont supprimées
      refetch();
    };

    // Ajouter l'écouteur d'événement
    window.addEventListener('notification:all-read', handleAllNotificationsRead);

    // Nettoyer l'écouteur lors du démontage du composant
    return () => {
      window.removeEventListener('notification:all-read', handleAllNotificationsRead);
    };
  }, [refetch]);

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

  // Générer les liens de pagination
  const renderPaginationLinks = () => {
    const links = [];
    const maxVisiblePages = 5;
    
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      links.push(
        <PaginationItem key={i}>
          <PaginationLink 
            isActive={currentPage === i}
            onClick={() => setCurrentPage(i)}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }
    
    return links;
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Historique des notifications</h1>
        <Button onClick={() => refetch()} variant="outline">
          Rafraîchir
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : isError ? (
        <div className="text-center p-8 bg-red-100 dark:bg-red-900/20 rounded-lg">
          <p className="text-red-600 dark:text-red-400">
            Une erreur est survenue lors du chargement des notifications.
          </p>
          <Button onClick={() => refetch()} variant="outline" className="mt-4">
            Réessayer
          </Button>
        </div>
      ) : data?.data && data.data.length > 0 ? (
        <>
          <div className="bg-card rounded-lg shadow overflow-hidden">
            <div className="divide-y divide-border">
              {data.data.map((notification: StockAlertNotification) => (
                <div 
                  key={notification.id} 
                  className="p-4 hover:bg-accent/10 transition-colors"
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
                    <div className="ml-4">
                      <span className={`inline-block w-3 h-3 rounded-full ${notification.read ? 'bg-gray-300 dark:bg-gray-600' : 'bg-green-500'}`}></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <Pagination className="mt-6">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
                  />
                </PaginationItem>
                
                {renderPaginationLinks()}
                
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className={currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      ) : (
        <div className="text-center p-12 bg-card rounded-lg border border-border">
          <BellIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">Aucune notification</h3>
          <p className="text-muted-foreground">
            L'historique des notifications est vide.
          </p>
        </div>
      )}
    </div>
  );
};

export default NotificationsHistory; 