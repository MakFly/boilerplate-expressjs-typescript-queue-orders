import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { body } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth.middleware';

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

// La route POST (création d'utilisateur) reste accessible sans authentification
router.post('/', validateUser, UserController.createUser);

// Toutes les autres routes nécessitent une authentification
router.get('/', authenticate, UserController.getUsers);

router.route('/:id')
    .get(authenticate, UserController.getUserById)
    .put(authenticate, validateUser, UserController.updateUser)
    // Seuls les administrateurs peuvent supprimer des utilisateurs
    .delete(authenticate, authorize(['admin']), UserController.deleteUser);

export default router; 