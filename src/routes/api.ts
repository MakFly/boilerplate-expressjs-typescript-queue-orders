import { Router } from 'express';
import authRouter from './auth';
import userRoutes from './users.route';
import ordersRoutes from './orders.route';

const router = Router();

router.use('/auth', authRouter);
router.use('/users', userRoutes);
router.use('/orders', ordersRoutes);

export default router;