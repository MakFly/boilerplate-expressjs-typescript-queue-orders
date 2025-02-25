"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const UserController_1 = require("../controllers/UserController");
const express_validator_1 = require("express-validator");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Middleware de validation
const validateUser = [
    (0, express_validator_1.body)('email')
        .isEmail().withMessage('Email invalide')
        .normalizeEmail(),
    (0, express_validator_1.body)('name')
        .notEmpty().withMessage('Le nom est requis')
        .trim()
        .isLength({ min: 2 }).withMessage('Le nom doit contenir au moins 2 caractères')
];
// Appliquer l'authentification à toutes les routes utilisateurs sauf en mode test
if (process.env.NODE_ENV !== 'test') {
    router.use(auth_middleware_1.authMiddleware);
}
router.route('/')
    .get(UserController_1.UserController.getUsers)
    .post(validateUser, UserController_1.UserController.createUser);
router.route('/:id')
    .get(UserController_1.UserController.getUserById)
    .put(validateUser, UserController_1.UserController.updateUser)
    .delete(UserController_1.UserController.deleteUser);
exports.default = router;
