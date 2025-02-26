import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../auth/jwt';
import { ApiError } from '../utils/ApiError';

// Étendre l'interface Request pour inclure l'utilisateur
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        [key: string]: any;
      };
    }
  }
}

/**
 * Middleware pour vérifier l'authentification via JWT
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Récupérer le token depuis les en-têtes
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Accès non autorisé. Token manquant ou invalide.');
    }

    // Extraire le token
    const token = authHeader.split(' ')[1];

    // Vérifier et décoder le token
    const decoded = await verifyToken(token);

    // Ajouter les informations de l'utilisateur à la requête
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role || 'user'
    };

    // Passer au middleware suivant
    next();
  } catch (error) {
    // Propager l'erreur au middleware de gestion d'erreurs
    next(ApiError.unauthorized('Accès non autorisé. Token invalide ou expiré.', { 
      originalError: error instanceof Error ? error.message : 'Une erreur inconnue est survenue' 
    }));
  }
};

/**
 * Middleware pour vérifier le rôle de l'utilisateur
 */
export const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Accès non autorisé. Utilisateur non authentifié.');
      }

      if (!roles.includes(req.user.role)) {
        throw ApiError.forbidden('Accès interdit. Vous n\'avez pas les droits nécessaires.');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}; 