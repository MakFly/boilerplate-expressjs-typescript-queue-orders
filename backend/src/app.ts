import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mainRouter from './routes/index';
import apiRouter from './routes/api';
import { errorHandler } from './middleware/errorHandler';
import logger from './utils/logger';
import { ApiError } from './utils/ApiError';
import { QueueService } from './services/QueueService';

const app: Application = express();

// Initialiser la connexion RabbitMQ
const queueService = QueueService.getInstance();
queueService.connect().catch(error => {
    logger.error('Erreur lors de la connexion à RabbitMQ:', error);
});

// Configuration du proxy pour express-rate-limit
// app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());

// Configuration de express.json() avec gestion d'erreurs
app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf, encoding) => {
        try {
            JSON.parse(buf.toString());
        } catch (e) {
            // Ne pas essayer de répondre ici, simplement lancer l'erreur
            // qui sera capturée par le middleware errorHandler
            throw new SyntaxError('Invalid JSON format');
        }
    }
}));

app.use(express.urlencoded({ extended: true }));

// Mount routes
app.use('/', mainRouter);
app.use('/api', apiRouter);

// Timeout configuration
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setTimeout(30000, () => {
    next(ApiError.internal('Request Timeout'));
  });
  next();
});

// Gestion des routes non trouvées
app.use((req, res, next) => {
    logger.warn(`Route non trouvée: ${req.method} ${req.url}`);
    next(ApiError.notFound('Route non trouvée'));
});

// Middleware de gestion d'erreurs (DOIT être le dernier middleware)
app.use(errorHandler);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: Error) => {
    logger.error('Unhandled Rejection:', reason);
    // Ne pas arrêter le serveur, juste logger l'erreur
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', error);
    // Arrêter proprement le serveur en cas d'erreur critique
    process.exit(1);
});

export default app;
