import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import logger from '../utils/logger';
import { ZodError } from 'zod';

// Interface pour étendre Error avec la propriété errors
interface ZodValidationError extends Error {
    errors: any[];
}

export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // Si les en-têtes ont déjà été envoyés, passez l'erreur au gestionnaire par défaut d'Express
    if (res.headersSent) {
        return next(err);
    }

    // Log l'erreur
    logger.error('Error:', {
        body: req.body,
        error: err.message,
        method: req.method,
        params: req.params,
        path: req.path,
        query: req.query,
        stack: err.stack
    });

    // Déterminer si nous sommes en mode développement
    const isDevelopment = process.env.NODE_ENV === 'development';

    // Préparer les détails d'erreur pour le mode développement
    const errorDetails = isDevelopment ? {
        stack: err.stack,
        body: req.body,
        params: req.params,
        query: req.query
    } : undefined;

    // Gestion des erreurs de validation Zod
    if (err instanceof ZodError) {
        return res.status(400).json({
            success: false,
            message: 'Erreur de validation',
            errors: err.errors,
            details: errorDetails
        });
    }

    // Gestion des erreurs de parsing JSON
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({
            success: false,
            message: 'Invalid JSON format',
            error: err.message,
            details: errorDetails
        });
    }

    // Gestion des erreurs API personnalisées
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            errors: err.details,
            details: errorDetails
        });
    }

    // Erreur par défaut (500)
    return res.status(500).json({
        success: false,
        message: 'Une erreur interne est survenue',
        error: isDevelopment ? err.message : undefined,
        details: errorDetails
    });
};

// Middleware pour capturer les erreurs asynchrones
export const asyncErrorHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

export default errorHandler; 