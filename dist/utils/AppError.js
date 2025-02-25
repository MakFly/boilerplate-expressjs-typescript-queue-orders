"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createValidationError = exports.createConflictError = exports.createForbiddenError = exports.createUnauthorizedError = exports.createBadRequestError = exports.createNotFoundError = exports.AppError = void 0;
class AppError extends Error {
    constructor(message, statusCode, isOperational = true, details) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.details = details;
        // Capture de la stack trace
        Error.captureStackTrace(this, this.constructor);
        // Définir le nom de l'erreur
        this.name = this.constructor.name;
    }
}
exports.AppError = AppError;
// Fonction utilitaire pour créer des erreurs courantes
const createNotFoundError = (resource, id) => {
    const message = id
        ? `${resource} avec l'ID ${id} non trouvé(e)`
        : `${resource} non trouvé(e)`;
    return new AppError(message, 404);
};
exports.createNotFoundError = createNotFoundError;
const createBadRequestError = (message) => {
    return new AppError(message, 400);
};
exports.createBadRequestError = createBadRequestError;
const createUnauthorizedError = (message = 'Non autorisé') => {
    return new AppError(message, 401);
};
exports.createUnauthorizedError = createUnauthorizedError;
const createForbiddenError = (message = 'Accès interdit') => {
    return new AppError(message, 403);
};
exports.createForbiddenError = createForbiddenError;
const createConflictError = (message) => {
    return new AppError(message, 409);
};
exports.createConflictError = createConflictError;
const createValidationError = (message, details) => {
    return new AppError(message, 422, true, details);
};
exports.createValidationError = createValidationError;
