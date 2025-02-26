import { Router, Request, Response, NextFunction } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// Fonction wrapper pour passer le paramètre next aux contrôleurs
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * @route POST /api/auth/login
 * @desc Authentifie un utilisateur et génère un token JWT
 * @access Public
 */
router.post("/login", asyncHandler(AuthController.login));

/**
 * @route GET /api/auth/me
 * @desc Récupère les informations de l'utilisateur connecté
 * @access Private
 */
router.get("/me", authenticate, asyncHandler(AuthController.getCurrentUser));

/**
 * @route GET /api/auth/validate
 * @desc Valide un token JWT
 * @access Private
 */
router.get("/validate", authenticate, asyncHandler(AuthController.validateToken));

export default router;
