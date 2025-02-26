import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  PencilIcon,
  DocumentPlusIcon,
  XMarkIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import { OrderStatus } from '../types';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { orderService } from '../services/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const OrderDetails: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Utiliser directement useQuery au lieu du hook personnalisé
  const { 
    data: order, 
    isLoading, 
    error, 
    refetch 
  } = useQuery(['orders', 'detail', id], () => orderService.getOrderById(id), {
    enabled: !!id, // Ne pas exécuter la requête si l'ID est vide
  });
  
  // Utiliser directement useMutation au lieu du hook personnalisé
  const updateStatusMutation = useMutation(
    ({ id, status }: { id: string; status: OrderStatus }) => 
      orderService.updateOrderStatus(id, status),
    {
      onSuccess: (data) => {
        // Invalider les requêtes pour forcer un rechargement
        queryClient.invalidateQueries(['orders']);
        refetch();
      },
    }
  );
  
  const addNoteMutation = useMutation(
    ({ id, note }: { id: string; note: string }) => 
      orderService.addOrderNote(id, note),
    {
      onSuccess: (data) => {
        // Invalider les requêtes pour forcer un rechargement
        queryClient.invalidateQueries(['orders', 'detail', id]);
        refetch();
      },
    }
  );
  
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('PENDING');
  const [note, setNote] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleBack = () => {
    navigate('/orders');
  };

  const handleOpenStatusDialog = () => {
    if (order) {
      // Vérifier si la commande est annulée
      if (order.status === 'CANCELLED') {
        if (window.showNotification) {
          window.showNotification('Les commandes annulées ne peuvent pas être modifiées', 'error');
        }
        return;
      }
      
      // Vérifier si la commande est livrée
      if (order.status === 'DELIVERED') {
        if (window.showNotification) {
          window.showNotification('Les commandes livrées ne peuvent pas être modifiées', 'error');
        }
        return;
      }
      
      setNewStatus(order.status);
      setStatusDialogOpen(true);
    }
  };

  const handleCloseStatusDialog = () => {
    setStatusDialogOpen(false);
  };

  const handleOpenNoteDialog = () => {
    setNote('');
    setNoteDialogOpen(true);
  };

  const handleCloseNoteDialog = () => {
    setNoteDialogOpen(false);
  };

  const handleStatusChange = async () => {
    if (!order || !id) return;
    
    // Vérification du flux de statut
    if (order.status === 'CANCELLED') {
      if (window.showNotification) {
        window.showNotification('Une commande annulée ne peut pas être modifiée', 'error');
      }
      return;
    }
    
    // Vérifier que le flux de statut est respecté
    if (order.status === 'PENDING' && newStatus !== 'CONFIRMED' && newStatus !== 'CANCELLED') {
      if (window.showNotification) {
        window.showNotification('Une commande en attente ne peut être que confirmée ou annulée', 'error');
      }
      return;
    }
    
    if (order.status === 'CONFIRMED' && newStatus !== 'DELIVERED' && newStatus !== 'CANCELLED') {
      if (window.showNotification) {
        window.showNotification('Une commande confirmée ne peut être que livrée ou annulée', 'error');
      }
      return;
    }
    
    if (order.status === 'DELIVERED' && newStatus !== 'DELIVERED') {
      if (window.showNotification) {
        window.showNotification('Une commande livrée ne peut plus être modifiée', 'error');
      }
      return;
    }
    
    try {
      setIsValidating(true);
      
      // Si le statut passe de PENDING à CONFIRMED, utiliser validateOrder
      if (order.status === 'PENDING' && newStatus === 'CONFIRMED') {
        try {
          const response = await orderService.validateOrder(id);
          // Notification de succès avec le message de l'API
          if (window.showNotification) {
            window.showNotification(response.message || '🎉 Commande validée avec succès', 'success');
          }
        } catch (err: any) {
          // Gérer spécifiquement les erreurs de stock insuffisant
          if (err.response?.data?.message?.includes('Stock insuffisant')) {
            const errorMessage = err.response.data.message;
            if (window.showNotification) {
              window.showNotification(errorMessage, 'error');
            }
            
            // Mettre automatiquement la commande en CANCELLED si stock insuffisant
            try {
              await updateStatusMutation.mutateAsync({ 
                id, 
                status: 'CANCELLED' as OrderStatus 
              });
              if (window.showNotification) {
                window.showNotification('La commande a été automatiquement annulée en raison du stock insuffisant', 'warning');
              }
            } catch (cancelErr) {
              console.error('Erreur lors de l\'annulation automatique:', cancelErr);
            }
            
            throw err; // Propager l'erreur pour arrêter l'exécution
          } else if (err.response?.data?.message?.includes('Route non trouvée')) {
            // Gérer l'erreur de route non trouvée
            if (window.showNotification) {
              window.showNotification('Erreur: Impossible de valider la commande. L\'API n\'est pas disponible.', 'error');
            }
            throw err;
          }
          throw err; // Propager les autres erreurs
        }
      } else {
        // Sinon, utiliser updateOrderStatus comme avant
        try {
          const response = await updateStatusMutation.mutateAsync({ 
            id, 
            status: newStatus as OrderStatus 
          });
          // Notification de succès avec le message de l'API
          if (window.showNotification) {
            window.showNotification(response.message || 'Statut de la commande mis à jour avec succès', 'success');
          }
        } catch (err: any) {
          // Gérer l'erreur de route non trouvée
          if (err.response?.data?.message?.includes('Route non trouvée')) {
            if (window.showNotification) {
              window.showNotification('Erreur: Impossible de mettre à jour le statut. L\'API n\'est pas disponible.', 'error');
            }
            throw err;
          }
          throw err;
        }
      }
      setStatusDialogOpen(false);
      
      // Activer l'état de rafraîchissement pour afficher le skeleton
      setIsRefreshing(true);
      
      // Invalider toutes les requêtes liées aux commandes pour forcer un rechargement
      queryClient.invalidateQueries(['orders']);
      queryClient.invalidateQueries(['orders', 'list']);
      queryClient.invalidateQueries(['orders', 'stats']);
      
      // Forcer le rechargement des données actuelles
      refetch();
      
      // Définir un délai minimum pour le skeleton (pour éviter un flash trop rapide)
      setTimeout(() => {
        setIsRefreshing(false);
      }, 1000);
    } catch (err: any) {
      console.error('Error updating status:', err);
      
      // Gérer les erreurs spécifiques
      if (err.response?.data?.message) {
        const errorMessage = err.response.data.message;
        if (window.showNotification) {
          window.showNotification(errorMessage, 'error');
        }
      } else if (window.showNotification) {
        // Afficher une erreur générique si aucun message spécifique n'est disponible
        window.showNotification('Une erreur est survenue lors de la mise à jour du statut', 'error');
      }
    } finally {
      setIsValidating(false);
    }
  };

  const handleAddNote = async () => {
    if (!order || !id || !note.trim()) return;
    
    try {
      const response = await addNoteMutation.mutateAsync({ id, note });
      setNoteDialogOpen(false);
      
      // Invalider les requêtes pertinentes
      queryClient.invalidateQueries(['orders', 'detail', id]);
      queryClient.invalidateQueries(['orders', 'list']);
      
      // Notification de succès avec le message de l'API
      if (window.showNotification) {
        window.showNotification(response.message || 'Note ajoutée avec succès', 'success');
      }
    } catch (err: any) {
      console.error('Error adding note:', err);
      
      // Gérer les erreurs spécifiques si l'intercepteur ne les a pas déjà traitées
      if (err.response && err.response.data && err.response.data.message && window.showNotification) {
        // L'erreur sera déjà affichée par l'intercepteur, pas besoin de la réafficher ici
      } else if (window.showNotification) {
        // Afficher une erreur générique si aucun message spécifique n'est disponible
        window.showNotification('Une erreur est survenue lors de l\'ajout de la note', 'error');
      }
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return format(parseISO(dateString), 'dd MMMM yyyy à HH:mm', { locale: fr });
  };

  const getStatusChip = (status: string) => {
    let colorClass = 'bg-gray-200 text-gray-800';
    let label = '';

    switch (status) {
      case 'PENDING':
        colorClass = 'bg-blue-100 text-blue-800';
        label = 'En attente';
        break;
      case 'CONFIRMED':
        colorClass = 'bg-yellow-100 text-yellow-800';
        label = 'Confirmée';
        break;
      case 'DELIVERED':
        colorClass = 'bg-green-100 text-green-800';
        label = 'Livrée';
        break;
      case 'CANCELLED':
        colorClass = 'bg-red-100 text-red-800';
        label = 'Annulée';
        break;
      default:
        label = status;
    }

    return <span className={`px-2 py-1 rounded-full text-sm font-medium ${colorClass}`}>{label}</span>;
  };

  // Rendu conditionnel pour le skeleton loader pendant le rafraîchissement
  const renderSkeletonLoader = () => {
    return (
      <div className="w-full animate-pulse">
        <div className="flex justify-between items-center mb-3">
          <div className="h-8 w-32 bg-gray-200 rounded"></div>
          <div className="flex space-x-2">
            <div className="h-8 w-32 bg-gray-200 rounded"></div>
            <div className="h-8 w-32 bg-gray-200 rounded"></div>
          </div>
        </div>
        
        <div className="bg-card text-card-foreground p-6 rounded-md shadow mb-6">
          <div className="flex flex-col md:flex-row justify-between mb-4">
            <div className="mb-4 md:mb-0">
              <div className="h-5 w-24 bg-gray-200 rounded mb-2"></div>
              <div className="h-6 w-48 bg-gray-200 rounded"></div>
            </div>
            <div>
              <div className="h-5 w-24 bg-gray-200 rounded mb-2"></div>
              <div className="h-6 w-32 bg-gray-200 rounded"></div>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row justify-between mb-4">
            <div className="mb-4 md:mb-0">
              <div className="h-5 w-24 bg-gray-200 rounded mb-2"></div>
              <div className="h-6 w-48 bg-gray-200 rounded"></div>
            </div>
            <div>
              <div className="h-5 w-24 bg-gray-200 rounded mb-2"></div>
              <div className="h-6 w-32 bg-gray-200 rounded"></div>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="table-auto w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-2 text-left">
                    <div className="h-5 w-24 bg-gray-200 rounded"></div>
                  </th>
                  <th className="px-4 py-2 text-right">
                    <div className="h-5 w-24 bg-gray-200 rounded ml-auto"></div>
                  </th>
                  <th className="px-4 py-2 text-right">
                    <div className="h-5 w-16 bg-gray-200 rounded ml-auto"></div>
                  </th>
                  <th className="px-4 py-2 text-right">
                    <div className="h-5 w-16 bg-gray-200 rounded ml-auto"></div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[1, 2].map((item) => (
                  <tr key={item} className="border-b">
                    <td className="px-4 py-2">
                      <div className="h-5 w-48 bg-gray-200 rounded"></div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="h-5 w-20 bg-gray-200 rounded ml-auto"></div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="h-5 w-10 bg-gray-200 rounded ml-auto"></div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="h-5 w-20 bg-gray-200 rounded ml-auto"></div>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right">
                    <div className="h-6 w-16 bg-gray-200 rounded ml-auto"></div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="h-6 w-24 bg-gray-200 rounded ml-auto"></div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-80vh">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mt-3">
        <button
          className="flex items-center text-primary hover:text-primary/80 mr-2"
          onClick={handleBack}
        >
          <ArrowLeftIcon className="h-5 w-5 mr-2" />
          Retour à la liste
        </button>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          {error instanceof Error ? error.message : "Commande non trouvée"}
        </div>
      </div>
    );
  }

  // Afficher le skeleton loader pendant le rafraîchissement
  if (isRefreshing) {
    return (
      <div className="w-full">
        <div className="flex justify-between items-center mb-3">
          <button
            className="flex items-center text-primary hover:text-primary/80 mr-2"
            onClick={handleBack}
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Retour à la liste
          </button>
        </div>
        {renderSkeletonLoader()}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-3">
        <button
          className="flex items-center text-primary hover:text-primary/80 mr-2"
          onClick={handleBack}
        >
          <ArrowLeftIcon className="h-5 w-5 mr-2" />
          Retour à la liste
        </button>
        <div>
          <button
            className="flex items-center text-primary hover:text-primary/80 mr-2"
            onClick={handleOpenNoteDialog}
          >
            <DocumentPlusIcon className="h-5 w-5 mr-2" />
            Ajouter une note
          </button>
          <button
            className={`flex items-center ${order.status === 'CANCELLED' || order.status === 'DELIVERED' ? 'text-gray-400 cursor-not-allowed' : 'text-primary hover:text-primary/80'}`}
            onClick={handleOpenStatusDialog}
            disabled={order.status === 'CANCELLED' || order.status === 'DELIVERED'}
          >
            <PencilIcon className="h-5 w-5 mr-2" />
            Modifier le statut
          </button>
        </div>
      </div>

      <div className="bg-card text-card-foreground p-3 mb-3 rounded-md shadow">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6">
            <h2 className="text-2xl font-bold mb-2">
              Commande #{order.id.substring(0, 8)}...
            </h2>
            <p className="text-base">
              Date: {formatDate(order.createdAt)}
            </p>
            <div className="mt-2">
              <span className="text-base font-medium mr-2">
                Statut:
              </span>
              {getStatusChip(order.status)}
            </div>
          </div>
          <div className="col-span-12 md:col-span-6">
            <h3 className="text-base font-bold mb-2">
              Client
            </h3>
            <p className="text-base">
              {order.user?.name || 'Client inconnu'}
            </p>
            <p className="text-sm text-muted-foreground">
              {order.user?.email || ''}
            </p>
          </div>
        </div>
      </div>

      {/* Explication du processus de commande */}
      <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3 mb-3 rounded-md">
        <h3 className="text-base font-bold mb-2">
          Processus de commande
        </h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li className={order.status === 'PENDING' ? 'font-bold' : ''}>
            En attente (PENDING) - La commande est créée mais pas encore confirmée
            {order.status === 'PENDING' && <span className="ml-2 text-blue-600">← Statut actuel</span>}
          </li>
          <li className={order.status === 'CONFIRMED' ? 'font-bold' : ''}>
            Confirmée (CONFIRMED) - La commande est validée et prête à être livrée
            {order.status === 'CONFIRMED' && <span className="ml-2 text-blue-600">← Statut actuel</span>}
          </li>
          <li className={order.status === 'DELIVERED' ? 'font-bold' : ''}>
            Livrée (DELIVERED) - La commande a été livrée au client
            {order.status === 'DELIVERED' && <span className="ml-2 text-blue-600">← Statut actuel</span>}
          </li>
          <li className={order.status === 'CANCELLED' ? 'font-bold' : ''}>
            Annulée (CANCELLED) - La commande a été annulée (stock insuffisant ou autre raison)
            {order.status === 'CANCELLED' && <span className="ml-2 text-blue-600">← Statut actuel</span>}
          </li>
        </ol>
        <p className="mt-2 text-sm">
          <strong>Note:</strong> Si un produit dans la commande est marqué comme "queuable", la commande reste en attente jusqu'à validation manuelle.
          {order.status === 'PENDING' && " Cette commande contient probablement des produits queuables."}
        </p>
      </div>

      <div className="bg-card text-card-foreground p-3 mb-3 rounded-md shadow">
        <h3 className="text-base font-bold mb-2">
          Articles
        </h3>
        <div className="overflow-x-auto">
          <table className="table-auto w-full">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-2 text-left">Produit</th>
                <th className="px-4 py-2 text-right">Prix unitaire</th>
                <th className="px-4 py-2 text-right">Quantité</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items && order.items.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="px-4 py-2">
                    {item.product?.name || 'Produit inconnu'}
                  </td>
                  <td className="px-4 py-2 text-right">{formatCurrency(item.price)}</td>
                  <td className="px-4 py-2 text-right">{item.quantity}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(item.price * item.quantity)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right">
                  <span className="text-base font-medium">Total</span>
                </td>
                <td className="px-4 py-2 text-right">
                  <span className="text-base font-medium">{formatCurrency(order.totalAmount)}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {order.notes && (
        <div className="bg-card text-card-foreground p-3 rounded-md shadow">
          <h3 className="text-base font-bold mb-2">
            Notes
          </h3>
          <p className="text-base">{order.notes}</p>
        </div>
      )}

      {/* Dialog pour modifier le statut */}
      <div
        className={`fixed inset-0 bg-black/50 flex items-center justify-center ${statusDialogOpen ? '' : 'hidden'}`}
        onClick={handleCloseStatusDialog}
      >
        <div 
          className="bg-card text-card-foreground p-6 rounded-lg shadow-xl max-w-md w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-xl font-bold mb-4">Modifier le statut de la commande</h3>
          <p className="text-muted-foreground mb-4">
            Sélectionnez le nouveau statut pour cette commande.
            {order.status === 'CANCELLED' && (
              <span className="block mt-2 text-red-500">
                Attention: Une commande annulée ne peut pas être modifiée.
              </span>
            )}
            {order.status === 'PENDING' && (
              <span className="block mt-2 text-amber-500">
                Attention: Une commande en attente ne peut être que confirmée ou annulée.
              </span>
            )}
            {order.status === 'CONFIRMED' && (
              <span className="block mt-2 text-amber-500">
                Attention: Une commande confirmée ne peut être que livrée ou annulée.
              </span>
            )}
            {order.status === 'DELIVERED' && (
              <span className="block mt-2 text-green-500">
                Attention: Une commande livrée ne peut plus être modifiée.
              </span>
            )}
          </p>
          <div className="mb-4">
            <label htmlFor="status-select" className="block text-sm font-medium mb-1">
              Statut
            </label>
            <select
              id="status-select"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary sm:text-sm rounded-md"
            >
              {/* Options conditionnelles selon le statut actuel */}
              {order.status === 'PENDING' && (
                <>
                  <option value="PENDING" disabled>En attente</option>
                  <option value="CONFIRMED">Confirmée</option>
                  <option value="CANCELLED">Annulée</option>
                </>
              )}
              
              {order.status === 'CONFIRMED' && (
                <>
                  <option value="CONFIRMED" disabled>Confirmée</option>
                  <option value="DELIVERED">Livrée</option>
                  <option value="CANCELLED">Annulée</option>
                </>
              )}
              
              {order.status === 'DELIVERED' && (
                <option value="DELIVERED" disabled>Livrée</option>
              )}
              
              {order.status === 'CANCELLED' && (
                <option value="CANCELLED" disabled>Annulée</option>
              )}
            </select>
          </div>
          <div className="flex justify-end space-x-2">
            <button
              onClick={handleCloseStatusDialog}
              className="inline-flex justify-center py-2 px-4 border border-input shadow-sm text-sm font-medium rounded-md bg-background hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            >
              <XMarkIcon className="h-5 w-5 mr-2" />
              Annuler
            </button>
            <button 
              onClick={handleStatusChange} 
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
              disabled={updateStatusMutation.isPending || isValidating}
            >
              {updateStatusMutation.isPending || isValidating ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-primary-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Traitement en cours...
                </>
              ) : (
                <>
                  <CheckIcon className="h-5 w-5 mr-2" />
                  Enregistrer
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Dialog pour ajouter une note */}
      <div
        className={`fixed inset-0 bg-black/50 flex items-center justify-center ${noteDialogOpen ? '' : 'hidden'}`}
        onClick={handleCloseNoteDialog}
      >
        <div 
          className="bg-card text-card-foreground p-6 rounded-lg shadow-xl max-w-md w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-xl font-bold mb-4">Ajouter une note</h3>
          <p className="text-muted-foreground mb-4">
            Ajoutez une note à cette commande.
          </p>
          <div className="mb-4">
            <label htmlFor="note" className="block text-sm font-medium mb-1">
              Note
            </label>
            <textarea
              id="note"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 block w-full border border-input bg-background rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary sm:text-sm"
            />
          </div>
          <div className="flex justify-end space-x-2">
            <button
              onClick={handleCloseNoteDialog}
              className="inline-flex justify-center py-2 px-4 border border-input shadow-sm text-sm font-medium rounded-md bg-background hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            >
              <XMarkIcon className="h-5 w-5 mr-2" />
              Annuler
            </button>
            <button 
              onClick={handleAddNote} 
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
              disabled={addNoteMutation.isPending || !note.trim()}
            >
              {addNoteMutation.isPending ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-primary-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Traitement en cours...
                </>
              ) : (
                <>
                  <CheckIcon className="h-5 w-5 mr-2" />
                  Enregistrer
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetails; 