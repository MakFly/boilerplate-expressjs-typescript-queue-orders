"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequest = void 0;
const AppError_1 = require("../utils/AppError");
/**
 * Middleware de validation utilisant Zod
 * @param schema Le schéma Zod à utiliser pour la validation
 * @param source La source des données à valider (body, query, params)
 */
const validateRequest = (schema, source = 'body') => {
    return (req, res, next) => {
        try {
            const data = req[source];
            const result = schema.safeParse(data);
            if (!result.success) {
                const formattedErrors = result.error.errors.map(error => ({
                    field: error.path.join('.'),
                    message: error.message
                }));
                throw new AppError_1.AppError('Erreur de validation', 422, true, formattedErrors);
            }
            // Remplacer les données validées
            req[source] = result.data;
            next();
        }
        catch (error) {
            if (error instanceof AppError_1.AppError) {
                next(error);
            }
            else {
                next(new AppError_1.AppError('Erreur de validation', 422));
            }
        }
    };
};
exports.validateRequest = validateRequest;
