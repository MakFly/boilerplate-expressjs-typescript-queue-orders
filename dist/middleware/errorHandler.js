"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const ApiError_1 = require("../utils/ApiError");
const logger_1 = __importDefault(require("../utils/logger"));
const zod_1 = require("zod");
const errorHandler = (err, req, res, next) => {
    // Log l'erreur
    logger_1.default.error('Error:', {
        body: req.body,
        error: err.message,
        method: req.method,
        params: req.params,
        path: req.path,
        query: req.query,
        stack: err.stack
    });
    // Gestion des erreurs de validation Zod
    if (err instanceof zod_1.ZodError) {
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
    if (err instanceof ApiError_1.ApiError) {
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
exports.errorHandler = errorHandler;
exports.default = exports.errorHandler;
