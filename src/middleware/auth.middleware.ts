import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

// Interface pour les données utilisateur dans le token
export interface UserPayload {
  id: string;
  email: string;
  role: string;
}

// Étendre l'interface Request pour inclure l'utilisateur
declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

/**
 * Middleware d'authentification qui vérifie le token JWT
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Récupérer le token depuis l'en-tête Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Token d\'authentification manquant ou invalide', 401);
    }
    
    // Extraire le token
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      throw new AppError('Token d\'authentification manquant', 401);
    }
    
    // Vérifier et décoder le token
    const jwtSecret = process.env.JWT_SECRET || 'default_secret_key';
    
    try {
      const decoded = jwt.verify(token, jwtSecret) as UserPayload;
      
      // Ajouter les informations utilisateur à la requête
      req.user = decoded;
      
      next();
    } catch (error) {
      logger.error('Erreur lors de la vérification du token', { error });
      throw new AppError('Token d\'authentification invalide ou expiré', 401);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware pour vérifier les rôles utilisateur
 */
export const roleMiddleware = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError('Utilisateur non authentifié', 401);
      }
      
      if (!roles.includes(req.user.role)) {
        throw new AppError('Accès non autorisé pour ce rôle', 403);
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
}; 