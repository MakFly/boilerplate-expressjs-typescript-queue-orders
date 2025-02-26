import { QueueService } from '../services/QueueService';
import { StockService } from '../services/stocks/StockService';
import { StockRepository } from '../repositories/StockRepository';
import { PrismaService } from '../services/PrismaService';
import { StockAlertService } from '../services/stocks/StockAlertService';
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
        this.stockAlertService = new StockAlertService(prismaService);
        
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
                // Utiliser le type et l'ID du produit au lieu du nom si productName n'est pas disponible
                const productInfo = notification.productName || notification.productId || 'Produit inconnu';
                logger.info(`Processing stock notification: ${notification.type} for ${productInfo}`);
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
        
        // Nettoyer les alertes invalides au démarrage
        await this.cleanupInvalidAlerts();
        
        // Vérifier l'état des files d'attente au démarrage
        await this.checkQueueStatus();
        
        // Vérifier périodiquement le nombre de commandes en attente
        setInterval(async () => {
            try {
                // Vérifier l'état des files d'attente
                await this.checkQueueStatus();
                
                // Récupérer les statistiques des alertes
                const stats = await this.stockAlertService.getAlertStats();
                
                // Loguer le nombre de commandes en attente
                const queuedOrders = stats.byType.QUEUED_ORDER || 0;
                if (queuedOrders > 0) {
                    logger.info(`Il y a actuellement ${queuedOrders} commandes en attente de validation`);
                    
                    // Récupérer les détails des commandes en attente
                    const alerts = await this.stockAlertService.getAlertsByType('QUEUED_ORDER', { limit: 10 });
                    if (alerts && alerts.length > 0) {
                        logger.info('Commandes en attente de validation:');
                        
                        // Récupérer les détails complets des commandes
                        for (const alert of alerts) {
                            try {
                                // Vérifier que order_id n'est pas null avant de faire la requête
                                if (!alert.order_id) {
                                    logger.warn(`Alerte ${alert.id} sans order_id valide`);
                                    continue;
                                }
                                
                                const order = await this.prismaService.client.order.findUnique({
                                    where: { id: alert.order_id },
                                    include: {
                                        items: {
                                            include: {
                                                product: true
                                            }
                                        }
                                    }
                                });
                                
                                if (order) {
                                    const queuableItems = order.items.filter(item => item.product.is_queuable);
                                    logger.info(`- Commande ${alert.order_id} (statut: ${order.status})`);
                                    logger.info(`  Produits queuables: ${queuableItems.map(item => `${item.product.name} (qté: ${item.quantity})`).join(', ')}`);
                                    logger.info(`  Créée le: ${new Date(order.createdAt).toLocaleString()}`);
                                    
                                    // Vérifier si la commande est dans RabbitMQ
                                    try {
                                        const queueInfo = await this.queueService.getQueueInfo('queuable_orders');
                                        if (queueInfo && queueInfo.messageCount > 0) {
                                            logger.info(`  Vérification de la présence dans RabbitMQ...`);
                                            // Cette vérification est coûteuse, donc on ne la fait que pour les commandes récentes (< 24h)
                                            const orderAge = Date.now() - new Date(order.createdAt).getTime();
                                            if (orderAge < 24 * 60 * 60 * 1000) {
                                                const isInQueue = await this.checkOrderInQueue(order.id);
                                                logger.info(`  Présence dans RabbitMQ: ${isInQueue ? 'OUI' : 'NON'}`);
                                            }
                                        }
                                    } catch (error) {
                                        logger.error(`  Erreur lors de la vérification dans RabbitMQ: ${error.message}`);
                                    }
                                } else {
                                    logger.info(`- Commande ${alert.order_id} pour le produit ${alert.product_id} (quantité: ${alert.quantity})`);
                                }
                            } catch (error) {
                                logger.error(`Erreur lors de la récupération des détails de la commande ${alert.order_id}:`, error);
                            }
                        }
                    }
                } else {
                    logger.debug('Aucune commande en attente de validation');
                }
            } catch (error) {
                logger.error('Erreur lors de la vérification des commandes queuables:', error);
            }
        }, 30000); // Vérification toutes les 30 secondes
    }
    
    // Nouvelle méthode pour vérifier l'état des files d'attente
    private async checkQueueStatus(): Promise<void> {
        try {
            // Vérifier la file d'attente des commandes queuables
            const queuableQueueInfo = await this.queueService.getQueueInfo('queuable_orders');
            if (queuableQueueInfo) {
                logger.info(`État de la file 'queuable_orders': ${queuableQueueInfo.messageCount} messages`);
            } else {
                logger.warn(`Impossible d'obtenir des informations sur la file 'queuable_orders'`);
            }
            
            // Vérifier la file d'attente standard
            const standardQueueInfo = await this.queueService.getQueueInfo('orders_queue');
            if (standardQueueInfo) {
                logger.info(`État de la file 'orders_queue': ${standardQueueInfo.messageCount} messages`);
            } else {
                logger.warn(`Impossible d'obtenir des informations sur la file 'orders_queue'`);
            }
            
            // Vérifier la file d'attente de traitement
            const processingQueueInfo = await this.queueService.getQueueInfo('orders_processing');
            if (processingQueueInfo) {
                logger.info(`État de la file 'orders_processing': ${processingQueueInfo.messageCount} messages`);
            }
        } catch (error) {
            logger.error('Erreur lors de la vérification de l\'état des files d\'attente:', error);
        }
    }
    
    // Méthode pour vérifier si une commande est dans la file d'attente
    private async checkOrderInQueue(orderId: string): Promise<boolean> {
        try {
            // Utiliser la nouvelle méthode du QueueService
            return await this.queueService.isOrderInQueue(orderId, 'queuable_orders');
        } catch (error) {
            logger.error(`Erreur lors de la vérification de la commande ${orderId} dans la file d'attente:`, error);
            return false;
        }
    }
    
    // Méthode pour traiter manuellement une commande queuable
    async processQueuableOrder(orderId: string): Promise<boolean> {
        try {
            logger.info(`Processing queuable order ${orderId} manually...`);
            
            // Déplacer la commande de la file queuable vers la file standard
            const moved = await this.queueService.moveOrderFromQueueToStandard(orderId);
            
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

    // Méthode pour nettoyer les alertes invalides (sans order_id)
    private async cleanupInvalidAlerts(): Promise<void> {
        try {
            // Rechercher les alertes QUEUED_ORDER sans order_id
            const invalidAlerts = await this.prismaService.client.stockAlert.findMany({
                where: {
                    type: 'QUEUED_ORDER',
                    order_id: null
                },
                include: {
                    notifications: true
                }
            });
            
            if (invalidAlerts.length > 0) {
                logger.warn(`Trouvé ${invalidAlerts.length} alertes QUEUED_ORDER invalides sans order_id`);
                
                // Récupérer les IDs des alertes invalides
                const invalidAlertIds = invalidAlerts.map(alert => alert.id);
                
                // D'abord supprimer les notifications associées à ces alertes
                await this.prismaService.client.stockAlertNotification.deleteMany({
                    where: {
                        alert_id: {
                            in: invalidAlertIds
                        }
                    }
                });
                
                logger.info(`Supprimé les notifications associées aux alertes invalides`);
                
                // Ensuite supprimer les alertes
                const result = await this.prismaService.client.stockAlert.deleteMany({
                    where: {
                        id: {
                            in: invalidAlertIds
                        }
                    }
                });
                
                logger.info(`Nettoyé ${result.count} alertes QUEUED_ORDER invalides`);
            } else {
                logger.debug('Aucune alerte QUEUED_ORDER invalide trouvée');
            }
        } catch (error) {
            logger.error('Erreur lors du nettoyage des alertes invalides:', error);
        }
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
    const stockService = new StockService(stockRepository, prismaService);
    
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