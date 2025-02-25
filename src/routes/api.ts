import { Router } from 'express';
import authRouter from './auth';
import usersRouter from './users.route';
import ordersRouter from './orders.route';

const router = Router();

// Routes de base
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes d'authentification
router.use('/auth', authRouter);

// Routes utilisateurs
router.use('/users', usersRouter);

// Routes commandes
router.use('/orders', ordersRouter);

export default router;