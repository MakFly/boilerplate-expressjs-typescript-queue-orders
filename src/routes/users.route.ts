import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { body } from 'express-validator';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Middleware de validation
const validateUser = [
    body('email')
        .isEmail().withMessage('Email invalide')
        .normalizeEmail(),
    body('name')
        .notEmpty().withMessage('Le nom est requis')
        .trim()
        .isLength({ min: 2 }).withMessage('Le nom doit contenir au moins 2 caractères')
];

// Appliquer l'authentification à toutes les routes utilisateurs sauf en mode test
if (process.env.NODE_ENV !== 'test') {
    router.use(authMiddleware);
}

router.route('/')
    .get(UserController.getUsers)
    .post(validateUser, UserController.createUser);

router.route('/:id')
    .get(UserController.getUserById)
    .put(validateUser, UserController.updateUser)
    .delete(UserController.deleteUser);

export default router; 