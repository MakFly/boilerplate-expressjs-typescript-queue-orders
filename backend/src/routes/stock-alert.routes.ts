import { Router } from 'express';
import { StockAlertController } from '../controllers/stock-alert.controller';
import { authenticate } from '../middleware/auth.middleware';
import { asyncErrorHandler } from '../middleware/errorHandler';

const router = Router();
const stockAlertController = new StockAlertController();

/**
 * @swagger
 * /api/stock-alerts/stats:
 *   get:
 *     summary: Récupère les statistiques des alertes
 *     tags: [Stock Alerts]
 *     responses:
 *       200:
 *         description: Statistiques des alertes
 */
router.get('/stats', authenticate, asyncErrorHandler(stockAlertController.getAlertStats.bind(stockAlertController)));

/**
 * @swagger
 * /api/stock-alerts/notifications/recent:
 *   get:
 *     summary: Récupère les notifications récentes
 *     tags: [Stock Alerts]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Nombre maximum de notifications à retourner
 *     responses:
 *       200:
 *         description: Liste des notifications récentes
 */
router.get('/notifications/recent', authenticate, asyncErrorHandler(stockAlertController.getRecentNotifications.bind(stockAlertController)));

/**
 * @swagger
 * /api/stock-alerts/notifications/{id}/read:
 *   post:
 *     summary: Marque une notification comme lue
 *     tags: [Stock Alerts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la notification
 *     responses:
 *       200:
 *         description: Notification marquée comme lue
 *       404:
 *         description: Notification non trouvée
 */
router.post('/notifications/:id/read', authenticate, asyncErrorHandler(stockAlertController.markNotificationAsRead.bind(stockAlertController)));

/**
 * @swagger
 * /api/stock-alerts/notifications/mark-all-read:
 *   post:
 *     summary: Marque toutes les notifications comme lues
 *     tags: [Stock Alerts]
 *     responses:
 *       200:
 *         description: Toutes les notifications ont été marquées comme lues
 */
router.post('/notifications/mark-all-read', authenticate, asyncErrorHandler(stockAlertController.markAllNotificationsAsRead.bind(stockAlertController)));

/**
 * @swagger
 * /api/stock-alerts/notifications/unread-count:
 *   get:
 *     summary: Récupère le nombre de notifications non lues
 *     tags: [Stock Alerts]
 *     responses:
 *       200:
 *         description: Nombre de notifications non lues
 */
router.get('/notifications/unread-count', authenticate, asyncErrorHandler(stockAlertController.getUnreadNotificationsCount.bind(stockAlertController)));

/**
 * @swagger
 * /api/stock-alerts/notifications/history:
 *   get:
 *     summary: Récupère l'historique complet des notifications
 *     tags: [Stock Alerts]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Nombre maximum de notifications à retourner
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Nombre de notifications à ignorer
 *     responses:
 *       200:
 *         description: Historique des notifications
 */
router.get('/notifications/history', authenticate, asyncErrorHandler(stockAlertController.getNotificationsHistory.bind(stockAlertController)));

/**
 * @swagger
 * /api/stock-alerts:
 *   get:
 *     summary: Récupère toutes les alertes de stock
 *     tags: [Stock Alerts]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Type d'alerte
 *       - in: query
 *         name: productId
 *         schema:
 *           type: string
 *         description: ID du produit
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Nombre maximum d'alertes à retourner
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Nombre d'alertes à ignorer
 *     responses:
 *       200:
 *         description: Liste des alertes de stock
 */
router.get('/', authenticate, asyncErrorHandler(stockAlertController.getAllAlerts.bind(stockAlertController)));

/**
 * @swagger
 * /api/stock-alerts/{id}:
 *   get:
 *     summary: Récupère une alerte de stock par son ID
 *     tags: [Stock Alerts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de l'alerte
 *     responses:
 *       200:
 *         description: Alerte de stock
 *       404:
 *         description: Alerte non trouvée
 */
router.get('/:id', authenticate, asyncErrorHandler(stockAlertController.getAlertById.bind(stockAlertController)));

export default router; 