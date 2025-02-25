"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
/**
 * Configuration globale de l'application
 */
exports.config = {
    jwt: {
        secret: process.env.JWT_SECRET || 'default_secret_key',
        expiresIn: '24h'
    },
    // Autres configurations peuvent être ajoutées ici
};
