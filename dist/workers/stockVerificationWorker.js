"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startStockVerificationWorker = exports.StockVerificationWorker = void 0;
const QueueService_1 = require("../services/QueueService");
const StockService_1 = require("../services/StockService");
const StockRepository_1 = require("../repositories/StockRepository");
const PrismaService_1 = require("../services/PrismaService");
const StockAlertService_1 = require("../services/StockAlertService");
const logger_1 = __importDefault(require("../utils/logger"));
class StockVerificationWorker {
    constructor(queueService, stockService, prismaService) {
        this.queueService = queueService;
        this.stockService = stockService;
        this.prismaService = prismaService;
        // Récupérer l'ID du worker depuis les variables d'environnement
        this.workerId = process.env.WORKER_ID || 'default';
        // Initialiser le service d'alertes
        this.stockAlertService = new StockAlertService_1.StockAlertService(prismaService, queueService);
        logger_1.default.info(`Stock verification worker ${this.workerId} initialized`);
    }
    async start() {
        // Consommer les messages de la queue 'stock-alerts' pour les alertes de stock
        await this.queueService.consumeMessages('stock-alerts', async (alert) => {
            try {
                logger_1.default.info(`Worker ${this.workerId} processing stock alert:`, alert);
                await this.stockService.processStockAlert(alert);
            }
            catch (error) {
                logger_1.default.error(`Worker ${this.workerId} error in stock alert processing:`, error);
                throw error;
            }
        });
        // Consommer les messages de la queue 'stock-notifications' pour les notifications
        await this.queueService.consumeMessages('stock-notifications', async (notification) => {
            try {
                logger_1.default.info(`Processing stock notification: ${notification.type} for ${notification.productName}`);
                // Ici, on pourrait envoyer des notifications par email, SMS, etc.
                // Pour l'instant, on se contente de logger
                logger_1.default.info(`[${notification.severity}] ${notification.message}`);
            }
            catch (error) {
                logger_1.default.error('Error in stock notification processing:', error);
                throw error;
            }
        });
        // Consommer les messages de la queue 'orders_queue' pour les vérifications de stock
        // Cette file ne contient que les commandes sans produits queuables
        await this.queueService.processQueue(async (message) => {
            try {
                if (message.type === 'STOCK_VERIFICATION') {
                    logger_1.default.info('Processing stock verification:', message.data);
                    // Traitement des produits non-queuables uniquement
                    if (!message.data.hasQueuableProducts) {
                        logger_1.default.info('Processing standard order:', message.data.orderId);
                        // Utiliser la nouvelle méthode du StockService pour traiter la commande
                        const success = await this.stockService.processOrderStock(message.data.orderId, message.data.items);
                        if (success) {
                            logger_1.default.info(`Order ${message.data.orderId} processed successfully`);
                        }
                        else {
                            logger_1.default.warn(`Order ${message.data.orderId} processed with warnings`);
                        }
                    }
                }
            }
            catch (error) {
                logger_1.default.error('Error in stock verification worker:', error);
                throw error;
            }
        });
        // Un seul message de log pour indiquer que tout est configuré
        logger_1.default.info('Notification listener setup complete');
        // Surveiller la file d'attente des commandes queuables sans les traiter
        // Cette partie remplace le worker dédié aux commandes queuables
        await this.monitorQueuableOrders();
        // Nettoyer périodiquement les anciennes alertes
        this.setupPeriodicCleanup();
    }
    // Méthode pour surveiller les commandes queuables
    async monitorQueuableOrders() {
        logger_1.default.info('Monitoring queuable orders queue...');
        // On ne consomme pas les messages, on les laisse dans la file
        // jusqu'à ce qu'ils soient traités manuellement via l'API
        // Vérifier périodiquement le nombre de commandes en attente
        setInterval(async () => {
            try {
                // Récupérer les statistiques des alertes
                const stats = await this.stockAlertService.getAlertStats();
                // Loguer le nombre de commandes en attente
                const queuedOrders = stats.byType.QUEUED_ORDER;
                if (queuedOrders > 0) {
                    logger_1.default.info(`Il y a actuellement ${queuedOrders} commandes en attente de validation`);
                }
            }
            catch (error) {
                logger_1.default.error('Erreur lors de la vérification des commandes queuables:', error);
            }
        }, 60000); // Vérification toutes les minutes
    }
    // Méthode pour traiter manuellement une commande queuable
    async processQueuableOrder(orderId) {
        try {
            logger_1.default.info(`Processing queuable order ${orderId} manually...`);
            // Déplacer la commande de la file queuable vers la file standard
            const moved = await this.queueService.moveToStandardQueue(orderId);
            if (moved) {
                logger_1.default.info(`Queuable order ${orderId} moved to standard queue for processing`);
                // Marquer les alertes comme traitées
                await this.stockAlertService.markQueuedOrderAsProcessed(orderId, {
                    processedBy: 'WORKER',
                    validationType: 'MANUAL'
                });
                return true;
            }
            else {
                logger_1.default.warn(`Queuable order ${orderId} not found in queue`);
                return false;
            }
        }
        catch (error) {
            logger_1.default.error(`Error processing queuable order ${orderId}:`, error);
            throw error;
        }
    }
    // Configuration du nettoyage périodique des alertes
    setupPeriodicCleanup() {
        // Nettoyer les alertes une fois par jour
        setInterval(async () => {
            try {
                const count = await this.stockAlertService.cleanupOldAlerts();
                logger_1.default.info(`Cleaned up ${count} old stock alerts`);
            }
            catch (error) {
                logger_1.default.error('Error cleaning up old alerts:', error);
            }
        }, 24 * 60 * 60 * 1000); // Une fois par jour
    }
}
exports.StockVerificationWorker = StockVerificationWorker;
const startStockVerificationWorker = async (queueService, stockService, prismaService) => {
    const worker = new StockVerificationWorker(queueService, stockService, prismaService);
    await worker.start();
};
exports.startStockVerificationWorker = startStockVerificationWorker;
// Point d'entrée pour l'exécution directe du worker
if (require.main === module) {
    // Initialisation des services
    const queueService = QueueService_1.QueueService.getInstance();
    const prismaService = new PrismaService_1.PrismaService();
    const stockRepository = new StockRepository_1.StockRepository(prismaService);
    const stockService = new StockService_1.StockService(stockRepository, queueService, prismaService);
    logger_1.default.info('Starting stock verification worker...');
    // Connexion à RabbitMQ
    queueService.connect()
        .then(() => {
        logger_1.default.info('Connected to RabbitMQ, starting worker...');
        return (0, exports.startStockVerificationWorker)(queueService, stockService, prismaService);
    })
        .catch(error => {
        logger_1.default.error('Failed to start stock verification worker:', error);
        process.exit(1);
    });
}
