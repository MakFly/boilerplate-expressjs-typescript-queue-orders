import { Router } from 'express';
import { StockController } from '../controllers/stock.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/auth.middleware';

const router = Router();
const stockController = new StockController();

// Routes protégées par authentification
router.use(authenticate);

// Routes pour les transactions de stock (réservées aux admins et managers)
router.get('/transactions', authorize(['ADMIN', 'MANAGER']), stockController.getTransactions.bind(stockController));
router.post('/transactions', authorize(['ADMIN', 'MANAGER']), stockController.createTransaction.bind(stockController));

// Routes pour les alertes de stock
router.get('/alerts', authorize(['ADMIN', 'MANAGER']), stockController.getAlerts.bind(stockController));
router.get('/alerts/:id', authorize(['ADMIN', 'MANAGER']), stockController.getAlertById.bind(stockController));
router.patch('/alerts/:id/resolve', authorize(['ADMIN', 'MANAGER']), stockController.resolveAlert.bind(stockController));

// Routes pour les notifications d'alerte
router.get('/notifications', stockController.getNotifications.bind(stockController));
router.patch('/notifications/:id/read', stockController.markNotificationAsRead.bind(stockController));
router.patch('/notifications/read-all', authorize(['ADMIN', 'MANAGER']), stockController.markAllNotificationsAsRead.bind(stockController));
router.get('/notifications/unread-count', authorize(['ADMIN', 'MANAGER']), stockController.getUnreadNotificationsCount.bind(stockController));

// Route pour les statistiques d'alerte
router.get('/alerts/stats', authorize(['ADMIN', 'MANAGER']), stockController.getAlertStats.bind(stockController));

export default router; 