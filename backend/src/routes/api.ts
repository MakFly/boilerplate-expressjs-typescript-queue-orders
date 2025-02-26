import { Router } from 'express';
import authRouter from './auth';
import usersRouter from './users.route';
import ordersRouter from './orders.route';
import stockAlertRouter from './stock-alert.routes';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Routes de base
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes d'authentification
router.use('/auth', authRouter);

// Routes utilisateurs (authentification gérée au niveau des routes individuelles)
router.use('/users', authenticate, usersRouter);

// Routes commandes (protégées)
router.use('/orders', authenticate, ordersRouter);

// Routes pour les alertes de stock (protégées par le middleware dans les routes)
router.use('/stock-alerts', authenticate, stockAlertRouter);

export default router;