"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = exports.signToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
/**
 * Options de configuration pour la génération du token
 */
const tokenOptions = {
    expiresIn: "24h", // Durée de validité du token
};
// Clé secrète pour signer les tokens
const JWT_SECRET = process.env.JWT_SECRET || "default_secret_key";
/**
 * Génère un JWT token avec les données fournies
 * @param payload Les données à inclure dans le token
 * @returns Une promesse qui résout avec le token généré
 */
const signToken = (payload) => {
    return new Promise((resolve, reject) => {
        jsonwebtoken_1.default.sign(payload, JWT_SECRET, tokenOptions, (err, token) => {
            if (err || !token) {
                reject(new Error("Erreur lors de la génération du token"));
                return;
            }
            resolve(token);
        });
    });
};
exports.signToken = signToken;
/**
 * Vérifie et décode un JWT token
 * @param token Le token à vérifier
 * @returns Une promesse qui résout avec les données décodées du token
 */
const verifyToken = (token) => {
    return new Promise((resolve, reject) => {
        jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, decoded) => {
            if (err || !decoded) {
                reject(new Error("Token invalide ou expiré"));
                return;
            }
            resolve(decoded);
        });
    });
};
exports.verifyToken = verifyToken;
