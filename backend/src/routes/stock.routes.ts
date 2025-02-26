import { Router } from 'express';
import { StockController } from '../controllers/stock.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { roleMiddleware } from '../middlewares/role.middleware';

const router = Router();
const stockController = new StockController();

// Routes pour les transactions de stock
router.get('/transactions', 
    authMiddleware, 
    roleMiddleware(['ADMIN', 'MANAGER']), 
    stockController.getTransactions.bind(stockController)
);

router.post('/transactions', 
    authMiddleware, 
    roleMiddleware(['ADMIN', 'MANAGER']), 
    stockController.createTransaction.bind(stockController)
);

// Routes pour les alertes de stock
router.get('/alerts', 
    authMiddleware, 
    roleMiddleware(['ADMIN', 'MANAGER']), 
    stockController.getAlerts.bind(stockController)
);

router.get('/alerts/:id', 
    authMiddleware, 
    roleMiddleware(['ADMIN', 'MANAGER']), 
    stockController.getAlertById.bind(stockController)
);

router.put('/alerts/:id/resolve', 
    authMiddleware, 
    roleMiddleware(['ADMIN', 'MANAGER']), 
    stockController.resolveAlert.bind(stockController)
);

// Routes pour les notifications d'alerte
router.get('/notifications', 
    authMiddleware, 
    roleMiddleware(['ADMIN', 'MANAGER']), 
    stockController.getNotifications.bind(stockController)
);

router.put('/notifications/:id/read', 
    authMiddleware, 
    roleMiddleware(['ADMIN', 'MANAGER']), 
    stockController.markNotificationAsRead.bind(stockController)
);

router.put('/notifications/read-all', 
    authMiddleware, 
    roleMiddleware(['ADMIN', 'MANAGER']), 
    stockController.markAllNotificationsAsRead.bind(stockController)
);

router.get('/notifications/unread-count', 
    authMiddleware, 
    roleMiddleware(['ADMIN', 'MANAGER']), 
    stockController.getUnreadNotificationsCount.bind(stockController)
);

// Route pour les statistiques d'alerte
router.get('/alerts/stats', 
    authMiddleware, 
    roleMiddleware(['ADMIN', 'MANAGER']), 
    stockController.getAlertStats.bind(stockController)
);

export default router; 