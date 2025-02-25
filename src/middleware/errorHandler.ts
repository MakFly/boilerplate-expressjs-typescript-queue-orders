import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import logger from '../utils/logger';
import { ZodError } from 'zod';

export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {
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

    // Gestion des erreurs de validation Zod
    if (err instanceof ZodError) {
        return res.status(400).json({
            success: false,
            message: 'Erreur de validation',
            errors: err.errors
        });
    }

    // Gestion des erreurs de parsing JSON
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({
            success: false,
            message: 'Invalid JSON format',
            error: err.message
        });
    }

    // Gestion des erreurs API personnalisées
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            errors: err.details
        });
    }

    // Erreur par défaut (500)
    return res.status(500).json({
        success: false,
        message: 'Une erreur interne est survenue',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
};

export default errorHandler; 