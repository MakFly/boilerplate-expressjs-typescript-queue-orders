import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

const orderController = new OrderController();

// Toutes les routes de commandes sont déjà protégées par le middleware dans api.ts
// Nous ajoutons ici des autorisations spécifiques basées sur les rôles

// Récupérer toutes les commandes (accessible aux admins et aux gestionnaires)
router.get('/', authorize(['ADMIN', 'MANAGER']), orderController.getAllOrders.bind(orderController));

// Récupérer les statistiques des commandes (accessible aux admins et aux gestionnaires)
router.get('/stats', authorize(['ADMIN', 'MANAGER']), orderController.getOrderStats.bind(orderController));

// Récupérer une commande par ID (l'utilisateur peut voir ses propres commandes)
router.get('/:id', orderController.getOrderById.bind(orderController));

// Créer une nouvelle commande (tous les utilisateurs authentifiés)
router.post('/', orderController.createOrder.bind(orderController));

// Mettre à jour le statut d'une commande (réservé aux admins et gestionnaires)
router.patch('/:id/status', authorize(['ADMIN', 'MANAGER']), orderController.updateOrderStatus.bind(orderController));

// Valider manuellement une commande (réservé aux admins)
router.post('/:id/validate', authorize(['ADMIN']), orderController.validateOrder.bind(orderController));

// Supprimer une commande (réservé aux admins)
router.delete('/:id', authorize(['ADMIN']), orderController.deleteOrder.bind(orderController));

export default router;