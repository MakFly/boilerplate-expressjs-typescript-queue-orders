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
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        body: req.body,
        params: req.params,
        query: req.query
    });

    // Gestion des erreurs de validation Zod
    if (err instanceof ZodError) {
        return res.status(400).json({
            success: false,
            message: 'Erreur de validation',
            errors: err.errors
        });
    }

    // Gestion des erreurs API personnalisées
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            details: err.details
        });
    }

    // Erreur par défaut (500)
    return res.status(500).json({
        success: false,
        message: 'Une erreur interne est survenue',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
}; 