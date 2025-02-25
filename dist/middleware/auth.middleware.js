"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleMiddleware = exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const AppError_1 = require("../utils/AppError");
const logger_1 = require("../utils/logger");
/**
 * Middleware d'authentification qui vérifie le token JWT
 */
const authMiddleware = (req, res, next) => {
    try {
        // Récupérer le token depuis l'en-tête Authorization
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AppError_1.AppError('Token d\'authentification manquant ou invalide', 401);
        }
        // Extraire le token
        const token = authHeader.split(' ')[1];
        if (!token) {
            throw new AppError_1.AppError('Token d\'authentification manquant', 401);
        }
        // Vérifier et décoder le token
        const jwtSecret = process.env.JWT_SECRET || 'default_secret_key';
        try {
            const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
            // Ajouter les informations utilisateur à la requête
            req.user = decoded;
            next();
        }
        catch (error) {
            logger_1.logger.error('Erreur lors de la vérification du token', { error });
            throw new AppError_1.AppError('Token d\'authentification invalide ou expiré', 401);
        }
    }
    catch (error) {
        next(error);
    }
};
exports.authMiddleware = authMiddleware;
/**
 * Middleware pour vérifier les rôles utilisateur
 */
const roleMiddleware = (roles) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                throw new AppError_1.AppError('Utilisateur non authentifié', 401);
            }
            if (!roles.includes(req.user.role)) {
                throw new AppError_1.AppError('Accès non autorisé pour ce rôle', 403);
            }
            next();
        }
        catch (error) {
            next(error);
        }
    };
};
exports.roleMiddleware = roleMiddleware;
