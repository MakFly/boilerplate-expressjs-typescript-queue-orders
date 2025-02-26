import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import { CreateOrderSchema } from '../dto/order.dto';
import { Request, Response, NextFunction } from 'express';

const router = Router();

const orderController = new OrderController();

// Middleware pour ajouter l'ID de l'utilisateur à partir du token JWT
const addUserIdFromToken = (req: Request, res: Response, next: NextFunction) => {
    if (req.user && req.user.id) {
        req.body.userId = req.user.id;
    }
    next();
};

// Toutes les routes de commandes sont déjà protégées par le middleware dans api.ts
// Nous ajoutons ici des autorisations spécifiques basées sur les rôles

// Récupérer toutes les commandes (accessible aux admins et aux gestionnaires)
router.get('/', authorize(['ADMIN', 'MANAGER']), orderController.getAllOrders.bind(orderController));

// Récupérer les statistiques des commandes (accessible aux admins et aux gestionnaires)
router.get('/stats', authorize(['ADMIN', 'MANAGER']), orderController.getOrderStats.bind(orderController));

// Récupérer une commande par ID (l'utilisateur peut voir ses propres commandes)
router.get('/:id', orderController.getOrderById.bind(orderController));

// Créer une nouvelle commande (tous les utilisateurs authentifiés)
router.post('/', 
    addUserIdFromToken,
    validateRequest(CreateOrderSchema), 
    orderController.createOrder.bind(orderController)
);

// Mettre à jour le statut d'une commande (réservé aux admins et gestionnaires)
router.patch('/:id/status', authorize(['ADMIN', 'MANAGER']), orderController.updateOrderStatus.bind(orderController));

// Valider manuellement une commande (réservé aux admins)
router.post('/:id/validate', authorize(['ADMIN']), orderController.validateOrder.bind(orderController));

// Supprimer une commande (réservé aux admins)
router.delete('/:id', authorize(['ADMIN']), orderController.deleteOrder.bind(orderController));

export default router;