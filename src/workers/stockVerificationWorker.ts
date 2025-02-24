import { QueueService } from '../services/QueueService';
import { StockService } from '../services/StockService';
import { QueueMessage } from '../types/order.types';
import logger from '../utils/logger';
import { PrismaClient } from '@prisma/client';

export class StockVerificationWorker {
    private queueService: QueueService;
    private stockService: StockService;
    private prisma: PrismaClient;
    private workerId: string;
    private metrics: {
        processedOrders: number;
        failedOrders: number;
        processingTime: number[];
    };

    constructor(workerId: string = '1') {
        this.queueService = QueueService.getInstance();
        this.stockService = new StockService();
        this.prisma = new PrismaClient();
        this.workerId = workerId;
        this.metrics = {
            processedOrders: 0,
            failedOrders: 0,
            processingTime: []
        };
        this.initialize();
        this.startMetricsReporting();
    }

    private async initialize() {
        try {
            logger.info(`🚀 Démarrage du worker de vérification des stocks ${this.workerId}...`);
            await this.queueService.connect();
            logger.info('✅ Connexion RabbitMQ établie');
            await this.startProcessing();
            logger.info(`✨ Worker ${this.workerId} prêt à traiter les messages`);
        } catch (error) {
            logger.error(`❌ Erreur lors de l'initialisation du worker ${this.workerId}:`, error);
            process.exit(1);
        }
    }

    private startMetricsReporting() {
        setInterval(() => {
            const avgProcessingTime = this.metrics.processingTime.length 
                ? this.metrics.processingTime.reduce((a, b) => a + b, 0) / this.metrics.processingTime.length 
                : 0;

            logger.info(`📊 Métriques Worker ${this.workerId}:`, {
                processedOrders: this.metrics.processedOrders,
                failedOrders: this.metrics.failedOrders,
                avgProcessingTime: `${avgProcessingTime.toFixed(2)}ms`
            });

            // Réinitialiser les métriques
            this.metrics.processingTime = [];
        }, 30000); // Rapport toutes les 30 secondes
    }

    private async startProcessing() {
        this.queueService.processQueue(
            async (message: QueueMessage) => {
                const startTime = Date.now();
                logger.info(`📥 Message reçu par le worker ${this.workerId}:`, message);

                if (message.type !== 'STOCK_VERIFICATION') {
                    logger.warn(`⚠️ Worker ${this.workerId} - Type de message non géré:`, message.type);
                    return;
                }

                try {
                    const { orderId, items } = message.data;
                    logger.info(`🔍 Vérification des stocks pour la commande ${orderId}...`);

                    // Récupérer les détails des produits
                    const products = await this.prisma.product.findMany({
                        where: { id: { in: items.map(item => item.productId) } }
                    });

                    // Vérifier la disponibilité des stocks
                    for (const item of items) {
                        const product = products.find(p => p.id === item.productId);
                        if (!product) {
                            throw new Error(`Produit ${item.productId} non trouvé`);
                        }

                        logger.info(`📦 Produit ${product.name}:`, {
                            stockActuel: product.stock,
                            quantitéDemandée: item.quantity,
                            estQueuable: product.is_queuable
                        });
                    }

                    // Mettre à jour les stocks et la commande
                    const result = await this.stockService.checkAndReserveStock(orderId, items);
                    
                    if (result.some(r => r.success)) {
                        // Ne pas confirmer la commande si elle contient des produits queuables
                        if (message.data.hasQueuableProducts) {
                            logger.info(`⏳ Commande ${orderId} maintenue en PENDING - Contient des produits queuables`);
                            return;
                        }

                        // Mettre à jour le statut de la commande uniquement si pas de produits queuables
                        await this.prisma.order.update({
                            where: { id: orderId },
                            data: { status: 'CONFIRMED' }
                        });

                        logger.info(`✅ Commande ${orderId} confirmée - Stocks mis à jour`);
                        
                        // Logs détaillés des mises à jour
                        result.forEach(r => {
                            logger.info(`📊 Mise à jour stock pour ${r.productId}:`, {
                                ancienStock: r.currentStock,
                                nouveauStock: r.newStock,
                                misEnQueue: r.isQueued
                            });
                        });
                    } else {
                        logger.warn(`⚠️ Commande ${orderId} non confirmée - Problème de stock`);
                    }

                    this.metrics.processedOrders++;
                    this.metrics.processingTime.push(Date.now() - startTime);
                } catch (error) {
                    this.metrics.failedOrders++;
                    logger.error(`❌ Worker ${this.workerId} - Erreur lors du traitement:`, error);
                    throw error;
                }
            },
            { prefetch: 1 }
        );

        logger.info(`🎯 Worker ${this.workerId} en attente de messages...`);
    }
}

// Créer et démarrer le worker
const worker = new StockVerificationWorker();

// Gérer la fermeture propre
process.on('SIGINT', async () => {
    logger.info('🛑 Arrêt du worker...');
    await worker['queueService'].close();
    await worker['prisma'].$disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('🛑 Arrêt du worker...');
    await worker['queueService'].close();
    await worker['prisma'].$disconnect();
    process.exit(0);
}); 