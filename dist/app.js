"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const index_1 = __importDefault(require("./routes/index"));
const api_1 = __importDefault(require("./routes/api"));
const errorHandler_1 = require("./middleware/errorHandler");
const logger_1 = __importDefault(require("./utils/logger"));
const ApiError_1 = require("./utils/ApiError");
const QueueService_1 = require("./services/QueueService");
const app = (0, express_1.default)();
// Initialiser la connexion RabbitMQ
const queueService = QueueService_1.QueueService.getInstance();
queueService.connect().catch(error => {
    logger_1.default.error('Erreur lors de la connexion à RabbitMQ:', error);
});
// Configuration du proxy pour express-rate-limit
// app.set('trust proxy', 1);
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Mount routes
app.use('/', index_1.default);
app.use('/api', api_1.default);
// Timeout configuration
app.use((req, res, next) => {
    res.setTimeout(30000, () => {
        next(ApiError_1.ApiError.internal('Request Timeout'));
    });
    next();
});
// Gestion des routes non trouvées
app.use((req, res, next) => {
    logger_1.default.warn(`Route non trouvée: ${req.method} ${req.url}`);
    next(ApiError_1.ApiError.notFound('Route non trouvée'));
});
// Middleware de gestion d'erreurs (DOIT être le dernier middleware)
app.use(errorHandler_1.errorHandler);
// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
    logger_1.default.error('Unhandled Rejection:', reason);
    // Ne pas arrêter le serveur, juste logger l'erreur
});
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger_1.default.error('Uncaught Exception:', error);
    // Arrêter proprement le serveur en cas d'erreur critique
    process.exit(1);
});
exports.default = app;
