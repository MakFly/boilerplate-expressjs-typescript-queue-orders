import { Router } from 'express';
import { OrderController } from '../controllers/OrderController';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

const orderController = new OrderController();

// Routes protégées par authentification
router.use(authMiddleware);

// Récupérer toutes les commandes
router.get('/', orderController.getAllOrders.bind(orderController));

// Récupérer une commande par ID
router.get('/:id', orderController.getOrderById.bind(orderController));

// Créer une nouvelle commande
router.post('/', orderController.createOrder.bind(orderController));

// Mettre à jour le statut d'une commande
router.patch('/:id/status', orderController.updateOrderStatus.bind(orderController));

// Valider manuellement une commande
router.post('/:id/validate', orderController.validateOrder.bind(orderController));

// Supprimer une commande
router.delete('/:id', orderController.deleteOrder.bind(orderController));

export default router;