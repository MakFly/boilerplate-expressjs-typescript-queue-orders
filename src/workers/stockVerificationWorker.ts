import { QueueService } from '../services/QueueService';
import { StockService } from '../services/StockService';
import { StockRepository } from '../repositories/StockRepository';
import { PrismaService } from '../services/PrismaService';
import { StockAlertService } from '../services/StockAlertService';
import logger from '../utils/logger';

export class StockVerificationWorker {
    private stockAlertService: StockAlertService;
    private workerId: string;

    constructor(
        private queueService: QueueService,
        private stockService: StockService,
        private prismaService: PrismaService
    ) {
        // Récupérer l'ID du worker depuis les variables d'environnement
        this.workerId = process.env.WORKER_ID || 'default';
        
        // Initialiser le service d'alertes
        this.stockAlertService = new StockAlertService(prismaService, queueService);
        
        logger.info(`Stock verification worker ${this.workerId} initialized`);
    }

    async start(): Promise<void> {
        // Consommer les messages de la queue 'stock-alerts' pour les alertes de stock
        await this.queueService.consumeMessages('stock-alerts', async (alert) => {
            try {
                logger.info(`Worker ${this.workerId} processing stock alert:`, alert);
                await this.stockService.processStockAlert(alert);
            } catch (error) {
                logger.error(`Worker ${this.workerId} error in stock alert processing:`, error);
                throw error;
            }
        });

        // Consommer les messages de la queue 'stock-notifications' pour les notifications
        await this.queueService.consumeMessages('stock-notifications', async (notification) => {
            try {
                logger.info(`Processing stock notification: ${notification.type} for ${notification.productName}`);
                // Ici, on pourrait envoyer des notifications par email, SMS, etc.
                // Pour l'instant, on se contente de logger
                logger.info(`[${notification.severity}] ${notification.message}`);
            } catch (error) {
                logger.error('Error in stock notification processing:', error);
                throw error;
            }
        });

        // Consommer les messages de la queue 'orders_queue' pour les vérifications de stock
        // Cette file ne contient que les commandes sans produits queuables
        await this.queueService.processQueue(async (message) => {
            try {
                if (message.type === 'STOCK_VERIFICATION') {
                    logger.info('Processing stock verification:', message.data);
                    
                    // Traitement des produits non-queuables uniquement
                    if (!message.data.hasQueuableProducts) {
                        logger.info('Processing standard order:', message.data.orderId);
                        
                        // Utiliser la nouvelle méthode du StockService pour traiter la commande
                        const success = await this.stockService.processOrderStock(
                            message.data.orderId,
                            message.data.items
                        );
                        
                        if (success) {
                            logger.info(`Order ${message.data.orderId} processed successfully`);
                        } else {
                            logger.warn(`Order ${message.data.orderId} processed with warnings`);
                        }
                    }
                }
            } catch (error) {
                logger.error('Error in stock verification worker:', error);
                throw error;
            }
        });

        // Un seul message de log pour indiquer que tout est configuré
        logger.info('Notification listener setup complete');
        
        // Surveiller la file d'attente des commandes queuables sans les traiter
        // Cette partie remplace le worker dédié aux commandes queuables
        await this.monitorQueuableOrders();
        
        // Nettoyer périodiquement les anciennes alertes
        this.setupPeriodicCleanup();
    }

    // Méthode pour surveiller les commandes queuables
    private async monitorQueuableOrders(): Promise<void> {
        logger.info('Monitoring queuable orders queue...');
        
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
                    logger.info(`Il y a actuellement ${queuedOrders} commandes en attente de validation`);
                }
            } catch (error) {
                logger.error('Erreur lors de la vérification des commandes queuables:', error);
            }
        }, 60000); // Vérification toutes les minutes
    }
    
    // Méthode pour traiter manuellement une commande queuable
    async processQueuableOrder(orderId: string): Promise<boolean> {
        try {
            logger.info(`Processing queuable order ${orderId} manually...`);
            
            // Déplacer la commande de la file queuable vers la file standard
            const moved = await this.queueService.moveToStandardQueue(orderId);
            
            if (moved) {
                logger.info(`Queuable order ${orderId} moved to standard queue for processing`);
                
                // Marquer les alertes comme traitées
                await this.stockAlertService.markQueuedOrderAsProcessed(orderId, {
                    processedBy: 'WORKER',
                    validationType: 'MANUAL'
                });
                
                return true;
            } else {
                logger.warn(`Queuable order ${orderId} not found in queue`);
                return false;
            }
        } catch (error) {
            logger.error(`Error processing queuable order ${orderId}:`, error);
            throw error;
        }
    }
    
    // Configuration du nettoyage périodique des alertes
    private setupPeriodicCleanup(): void {
        // Nettoyer les alertes une fois par jour
        setInterval(async () => {
            try {
                const count = await this.stockAlertService.cleanupOldAlerts();
                logger.info(`Cleaned up ${count} old stock alerts`);
            } catch (error) {
                logger.error('Error cleaning up old alerts:', error);
            }
        }, 24 * 60 * 60 * 1000); // Une fois par jour
    }
}

export const startStockVerificationWorker = async (
    queueService: QueueService,
    stockService: StockService,
    prismaService: PrismaService
): Promise<void> => {
    const worker = new StockVerificationWorker(queueService, stockService, prismaService);
    await worker.start();
};

// Point d'entrée pour l'exécution directe du worker
if (require.main === module) {
    // Initialisation des services
    const queueService = QueueService.getInstance();
    const prismaService = new PrismaService();
    const stockRepository = new StockRepository(prismaService);
    const stockService = new StockService(stockRepository, queueService, prismaService);
    
    logger.info('Starting stock verification worker...');
    
    // Connexion à RabbitMQ
    queueService.connect()
        .then(() => {
            logger.info('Connected to RabbitMQ, starting worker...');
            return startStockVerificationWorker(queueService, stockService, prismaService);
        })
        .catch(error => {
            logger.error('Failed to start stock verification worker:', error);
            process.exit(1);
        });
}