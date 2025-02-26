import { Request, Response, NextFunction } from 'express';
import { Schema } from 'zod';
import { AppError } from '../utils/AppError';

// Type pour les erreurs Zod
interface ZodErrorItem {
  path: (string | number)[];
  message: string;
}

/**
 * Middleware de validation utilisant Zod
 * @param schema Le schéma Zod à utiliser pour la validation
 * @param source La source des données à valider (body, query, params)
 */
export const validateRequest = (schema: Schema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req[source];
      const result = schema.safeParse(data);
      
      if (!result.success) {
        const formattedErrors = result.error.errors.map((error: any) => ({
          field: error.path.join('.'),
          message: error.message
        }));
        
        throw new AppError('Erreur de validation', 422, true, formattedErrors);
      }
      
      // Remplacer les données validées
      req[source] = result.data;
      
      next();
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
      } else {
        next(new AppError('Erreur de validation', 422));
      }
    }
  };
}; 