import { PrismaService } from './PrismaService';
import { QueueService } from './QueueService';
import { 
    CreateStockAlertDto, 
    StockAlertMetadata, 
    StockAlertNotification,
    StockAlertConfig,
    StockAlertStats,
    StockAlert,
    StockAlertUpdate,
    StockAlertsByProduct,
    StockAlertNotificationCreate,
    StockAlertType,
    StockAlertSeverity
} from '../types/stock.types';
import logger from '../utils/logger';

/**
 * Service dédié à la gestion des alertes de stock
 * Centralise toute la logique liée aux alertes pour éviter la duplication
 */
export class StockAlertService {
    private config: StockAlertConfig = {
        lowStockThreshold: (stock, quantity) => Math.max(5, quantity * 0.1),
        notificationEnabled: true,
        autoProcessing: true,
        alertExpirationDays: 30
    };

    // Stockage en mémoire des dernières notifications pour le streaming
    private recentNotifications: StockAlertNotification[] = [];
    private maxStoredNotifications = 100;
    
    // Callbacks pour les abonnements aux notifications
    private notificationCallbacks: Array<(notification: StockAlertNotification) => void> = [];

    constructor(
        private prisma: PrismaService,
        private queueService: QueueService
    ) {
        // Écouter les notifications pour les stocker en mémoire
        this.setupNotificationListener();
    }

    /**
     * Configure un écouteur pour les notifications
     */
    private async setupNotificationListener(): Promise<void> {
        try {
            // Consommer les messages de la queue 'stock-notifications'
            await this.queueService.consumeMessages('stock-notifications', async (notification: StockAlertNotification) => {
                // Ajouter la notification à la liste des récentes
                this.addRecentNotification(notification);
                
                // Logger la notification
                logger.info(`[${notification.severity}] ${notification.message}`);
            });
            
            logger.info('Notification listener setup complete');
        } catch (error) {
            logger.error('Error setting up notification listener:', error);
        }
    }

    /**
     * S'abonne aux notifications d'alertes
     */
    onNotification(callback: (notification: StockAlertNotification) => void): () => void {
        this.notificationCallbacks.push(callback);
        
        // Retourner une fonction pour se désabonner
        return () => {
            this.notificationCallbacks = this.notificationCallbacks.filter(cb => cb !== callback);
        };
    }

    /**
     * Ajoute une notification à la liste des récentes
     */
    private addRecentNotification(notification: StockAlertNotification): void {
        // Ajouter au début de la liste
        this.recentNotifications.unshift(notification);
        
        // Limiter la taille de la liste
        if (this.recentNotifications.length > this.maxStoredNotifications) {
            this.recentNotifications = this.recentNotifications.slice(0, this.maxStoredNotifications);
        }
        
        // Notifier les abonnés
        this.notificationCallbacks.forEach(callback => {
            try {
                callback(notification);
            } catch (error) {
                logger.error('Error in notification callback:', error);
            }
        });
    }

    /**
     * Récupère les notifications récentes
     */
    public async getRecentNotifications(limit: number = 20): Promise<StockAlertNotification[]> {
        try {
            const notifications = await this.prisma.client.stockAlertNotification.findMany({
                take: limit,
                orderBy: {
                    timestamp: 'desc'
                }
            });
            
            return notifications.map(notification => ({
                id: notification.id,
                type: notification.type,
                productId: notification.productId,
                productName: notification.productName,
                message: notification.message,
                severity: notification.severity,
                timestamp: notification.timestamp.toISOString(),
                read: notification.read,
                metadata: notification.metadata
            } as StockAlertNotification));
        } catch (error) {
            logger.error('Erreur lors de la récupération des notifications récentes', { error });
            throw error;
        }
    }

    /**
     * Récupère les alertes avec pagination et filtres
     */
    async getAlertsWithOptions(options: { 
        limit: number; 
        offset: number; 
        filters?: any;
    }): Promise<any> {
        try {
            const { limit, offset, filters = {} } = options;
            
            // Construire la requête
            const where: any = { ...filters };
            
            // Récupérer les alertes
            const alerts = await this.prisma.client.stockAlert.findMany({
                where,
                include: {
                    product: {
                        select: {
                            id: true,
                            name: true,
                            stock: true,
                            is_queuable: true
                        }
                    }
                },
                orderBy: {
                    created_at: 'desc'
                },
                skip: offset,
                take: limit
            });
            
            // Compter le total
            const total = await this.prisma.client.stockAlert.count({ where });
            
            return {
                data: alerts,
                pagination: {
                    total,
                    limit,
                    offset,
                    hasMore: offset + alerts.length < total
                }
            };
        } catch (error) {
            logger.error('Error getting alerts:', error);
            throw error;
        }
    }

    /**
     * Récupère les alertes critiques (HIGH et CRITICAL)
     */
    async getCriticalAlerts(): Promise<any[]> {
        try {
            // Récupérer toutes les alertes de type STOCK_OUT, LOW_STOCK et FAILED_ORDER
            const criticalAlertTypes = [
                StockAlertType.STOCK_OUT,
                StockAlertType.LOW_STOCK,
                StockAlertType.FAILED_ORDER
            ];
            
            const alerts = await this.prisma.client.stockAlert.findMany({
                where: {
                    type: {
                        in: criticalAlertTypes
                    },
                    // Ne pas inclure les alertes trop anciennes
                    created_at: {
                        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 jours
                    }
                },
                include: {
                    product: {
                        select: {
                            id: true,
                            name: true,
                            stock: true
                        }
                    }
                },
                orderBy: {
                    created_at: 'desc'
                }
            });
            
            // Transformer les alertes pour inclure la sévérité
            return alerts.map(alert => {
                let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM';
                
                switch (alert.type) {
                    case StockAlertType.STOCK_OUT:
                        severity = 'CRITICAL';
                        break;
                    case StockAlertType.LOW_STOCK:
                    case StockAlertType.FAILED_ORDER:
                        severity = 'HIGH';
                        break;
                }
                
                const metadata = alert.metadata as Partial<StockAlertMetadata> || {};
                
                return {
                    ...alert,
                    severity,
                    message: metadata.message || `Alerte pour ${alert.product.name}`
                };
            });
        } catch (error) {
            logger.error('Error getting critical alerts:', error);
            throw error;
        }
    }

    /**
     * Marque une alerte comme lue
     */
    async markAlertAsRead(alertId: string): Promise<void> {
        try {
            // Mettre à jour les métadonnées de l'alerte
            const alert = await this.prisma.client.stockAlert.findUnique({
                where: { id: alertId }
            });
            
            if (!alert) {
                throw new Error(`Alert ${alertId} not found`);
            }
            
            const metadata = alert.metadata as Partial<StockAlertMetadata> || {};
            
            await this.prisma.client.stockAlert.update({
                where: { id: alertId },
                data: {
                    metadata: {
                        ...metadata,
                        read: true,
                        readAt: new Date().toISOString()
                    }
                }
            });
            
            logger.info(`Alert ${alertId} marked as read`);
        } catch (error) {
            logger.error(`Error marking alert ${alertId} as read:`, error);
            throw error;
        }
    }

    /**
     * Récupère une commande en file d'attente
     */
    async getQueuedOrder(orderId: string): Promise<any> {
        try {
            // Vérifier si la commande a des alertes de type QUEUED_ORDER
            const alerts = await this.prisma.client.stockAlert.findMany({
                where: {
                    order_id: orderId,
                    type: StockAlertType.QUEUED_ORDER
                },
                include: {
                    product: {
                        select: {
                            id: true,
                            name: true,
                            stock: true
                        }
                    }
                }
            });
            
            if (alerts.length === 0) {
                return null;
            }
            
            // Récupérer la commande
            const order = await this.prisma.client.order.findUnique({
                where: { id: orderId },
                include: {
                    items: {
                        include: {
                            product: true
                        }
                    }
                }
            });
            
            if (!order) {
                return null;
            }
            
            return {
                order,
                alerts
            };
        } catch (error) {
            logger.error(`Error getting queued order ${orderId}:`, error);
            throw error;
        }
    }

    /**
     * Crée une nouvelle alerte de stock
     */
    async createAlert(data: CreateStockAlertDto, options?: { orderId?: string }): Promise<string> {
        try {
            // Standardiser les métadonnées
            const standardMetadata: Partial<StockAlertMetadata> = {
                timestamp: new Date().toISOString(),
                ...data.metadata
            };
            
            // Créer l'alerte
            const alert = await this.prisma.client.stockAlert.create({
                data: {
                    type: data.type,
                    quantity: data.quantity,
                    product_id: data.productId,
                    order_id: data.orderId || options?.orderId,
                    metadata: standardMetadata
                }
            });
            
            logger.info(`Stock alert created: ${data.type} for product ${data.productId}`);
            
            // Envoyer une notification si activé
            if (this.config.notificationEnabled) {
                await this.sendAlertNotification(alert.id);
            }
            
            return alert.id;
        } catch (error) {
            logger.error(`Error creating stock alert: ${error}`);
            throw error;
        }
    }

    /**
     * Vérifie si un produit a besoin d'une alerte de stock bas
     */
    async checkLowStockAlert(
        productId: string, 
        currentStock: number, 
        quantity: number = 0,
        options?: { orderId?: string }
    ): Promise<boolean> {
        try {
            // Récupérer le produit
            const product = await this.prisma.client.product.findUnique({
                where: { id: productId },
                select: { name: true, is_queuable: true }
            });
            
            if (!product) {
                logger.warn(`Product ${productId} not found when checking for low stock alert`);
                return false;
            }
            
            // Calculer le seuil
            const threshold = typeof this.config.lowStockThreshold === 'function'
                ? this.config.lowStockThreshold(currentStock, quantity)
                : this.config.lowStockThreshold;
            
            // Vérifier si le stock est bas
            if (currentStock <= threshold) {
                // Vérifier s'il existe déjà une alerte récente
                const recentAlert = await this.prisma.client.stockAlert.findFirst({
                    where: {
                        product_id: productId,
                        type: { in: ['LOW_STOCK', 'STOCK_OUT'] },
                        created_at: {
                            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 heures
                        }
                    }
                });
                
                // Si pas d'alerte récente, en créer une nouvelle
                if (!recentAlert) {
                    await this.createAlert({
                        type: currentStock === 0 ? StockAlertType.STOCK_OUT : StockAlertType.LOW_STOCK,
                        quantity: currentStock,
                        productId,
                        orderId: options?.orderId,
                        metadata: {
                            threshold,
                            currentStock,
                            message: currentStock === 0 
                                ? `Rupture de stock pour ${product.name}`
                                : `Stock bas pour ${product.name} (${currentStock} restants)`
                        }
                    }, options);
                    
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            logger.error(`Error checking low stock alert for product ${productId}: ${error}`);
            throw error;
        }
    }

    /**
     * Crée une alerte pour une commande en file d'attente
     */
    async createQueuedOrderAlert(
        productId: string, 
        quantity: number, 
        orderId: string
    ): Promise<void> {
        try {
            // Vérifier si le produit existe et est queuable
            const product = await this.prisma.client.product.findUnique({
                where: { id: productId },
                select: { id: true, name: true, stock: true, is_queuable: true }
            });
            
            if (!product) {
                logger.error(`Product ${productId} not found when creating queued order alert`);
                return;
            }
            
            if (!product.is_queuable) {
                logger.warn(`Product ${productId} is not queuable, skipping alert creation`);
                return;
            }
            
            // Calculer la position dans la file
            const queuePosition = await this.prisma.client.stockAlert.count({
                where: {
                    product_id: productId,
                    type: StockAlertType.QUEUED_ORDER
                }
            });
            
            // Créer l'alerte
            await this.createAlert({
                type: StockAlertType.QUEUED_ORDER,
                quantity,
                productId,
                orderId,
                metadata: {
                    queuedAt: new Date().toISOString(),
                    currentStock: product.stock,
                    queuePosition: queuePosition + 1,
                    message: `Commande en attente pour ${product.name} (position ${queuePosition + 1})`
                }
            });
            
            logger.info(`Queued order alert created for product ${productId}, order ${orderId}`);
        } catch (error) {
            logger.error(`Error creating queued order alert for product ${productId}: ${error}`);
            throw error;
        }
    }

    /**
     * Marque une alerte de commande en file d'attente comme traitée
     */
    async markQueuedOrderAsProcessed(
        orderId: string,
        processingInfo: {
            processedBy: string;
            validationType: 'MANUAL' | 'AUTOMATIC';
        }
    ): Promise<void> {
        try {
            // Mettre à jour les alertes
            await this.prisma.client.stockAlert.updateMany({
                where: {
                    order_id: orderId,
                    type: StockAlertType.QUEUED_ORDER
                },
                data: {
                    type: StockAlertType.PROCESSED,
                    metadata: {
                        processedAt: new Date().toISOString(),
                        processedBy: processingInfo.processedBy,
                        validatedAt: new Date().toISOString(),
                        validationType: processingInfo.validationType
                    }
                }
            });
            
            logger.info(`Queued order alerts for order ${orderId} marked as processed`);
            
            // Mettre à jour les positions dans la file pour les autres commandes
            await this.updateQueuePositions();
        } catch (error) {
            logger.error(`Error marking queued order as processed for order ${orderId}: ${error}`);
            throw error;
        }
    }

    /**
     * Crée une alerte pour une commande échouée
     */
    async createFailedOrderAlert(
        productId: string,
        quantity: number,
        reason: string,
        options?: { orderId?: string }
    ): Promise<void> {
        try {
            // Récupérer le stock actuel
            const product = await this.prisma.client.product.findUnique({
                where: { id: productId },
                select: { stock: true, name: true }
            });
            
            if (!product) {
                logger.error(`Product ${productId} not found when creating failed order alert`);
                return;
            }
            
            // Créer l'alerte
            await this.createAlert({
                type: StockAlertType.FAILED_ORDER,
                quantity,
                productId,
                orderId: options?.orderId,
                metadata: {
                    reason,
                    requestedQuantity: quantity,
                    availableStock: product.stock,
                    message: `Commande échouée pour ${product.name}: ${reason}`
                }
            }, options);
            
            logger.info(`Failed order alert created for product ${productId}`);
        } catch (error) {
            logger.error(`Error creating failed order alert for product ${productId}: ${error}`);
            throw error;
        }
    }

    /**
     * Met à jour les positions dans la file d'attente
     */
    private async updateQueuePositions(): Promise<void> {
        try {
            // Récupérer toutes les alertes de type QUEUED_ORDER
            const queuedAlerts = await this.prisma.client.stockAlert.findMany({
                where: { type: StockAlertType.QUEUED_ORDER },
                orderBy: { created_at: 'asc' }
            });
            
            // Regrouper par produit
            const alertsByProduct: Record<string, typeof queuedAlerts> = {};
            queuedAlerts.forEach(alert => {
                if (!alertsByProduct[alert.product_id]) {
                    alertsByProduct[alert.product_id] = [];
                }
                alertsByProduct[alert.product_id].push(alert);
            });
            
            // Mettre à jour les positions pour chaque produit
            for (const [productId, alerts] of Object.entries(alertsByProduct)) {
                for (let i = 0; i < alerts.length; i++) {
                    const alert = alerts[i];
                    const metadata = alert.metadata as Partial<StockAlertMetadata> || {};
                    
                    await this.prisma.client.stockAlert.update({
                        where: { id: alert.id },
                        data: {
                            metadata: {
                                ...metadata,
                                queuePosition: i + 1,
                                timestamp: metadata.timestamp || new Date().toISOString()
                            }
                        }
                    });
                }
            }
        } catch (error) {
            logger.error(`Error updating queue positions: ${error}`);
            throw error;
        }
    }

    /**
     * Envoie une notification pour une alerte
     */
    private async sendAlertNotification(alertId: string): Promise<void> {
        try {
            // Récupérer l'alerte avec les informations du produit
            const alert = await this.prisma.client.stockAlert.findUnique({
                where: { id: alertId },
                include: { product: true }
            });
            
            if (!alert) {
                logger.warn(`Alert ${alertId} not found when sending notification`);
                return;
            }
            
            // Déterminer la sévérité
            let severity: StockAlertSeverity = StockAlertSeverity.MEDIUM;
            switch (alert.type) {
                case StockAlertType.STOCK_OUT:
                    severity = StockAlertSeverity.CRITICAL;
                    break;
                case StockAlertType.LOW_STOCK:
                    severity = StockAlertSeverity.HIGH;
                    break;
                case StockAlertType.FAILED_ORDER:
                    severity = StockAlertSeverity.HIGH;
                    break;
                case StockAlertType.QUEUED_ORDER:
                    severity = StockAlertSeverity.MEDIUM;
                    break;
                case StockAlertType.PROCESSED:
                    severity = StockAlertSeverity.LOW;
                    break;
            }
            
            // Créer le message
            const metadata = alert.metadata as Partial<StockAlertMetadata> || {};
            const message = metadata.message || `Alerte de stock pour ${alert.product.name}`;
            
            // Créer les données de notification
            const notificationData: StockAlertNotificationCreate = {
                type: alert.type,
                productId: alert.product_id,
                productName: alert.product.name,
                message,
                severity,
                metadata
            };
            
            // 1. D'abord, enregistrer la notification dans la base de données
            const savedNotification = await this.createAlertNotification(notificationData);
            
            // 2. Ensuite, créer l'objet de notification complet avec l'ID généré
            const notification: StockAlertNotification = {
                id: savedNotification.id,
                type: savedNotification.type,
                productId: savedNotification.productId,
                productName: savedNotification.productName,
                message: savedNotification.message,
                severity: savedNotification.severity,
                timestamp: savedNotification.timestamp,
                read: savedNotification.read,
                metadata: savedNotification.metadata
            };
            
            // 3. Envoyer la notification à la file d'attente
            await this.queueService.sendMessage('stock-notifications', notification);
            
            // 4. Ajouter aux notifications récentes en mémoire
            this.addRecentNotification(notification);
            
            logger.info(`Stock alert notification sent for alert ${alertId} (notification ID: ${notification.id})`);
        } catch (error) {
            logger.error(`Error sending alert notification for alert ${alertId}: ${error}`);
            // Ne pas propager l'erreur pour ne pas bloquer le flux principal
        }
    }

    /**
     * Récupère les statistiques des alertes
     */
    async getAlertStats(): Promise<StockAlertStats> {
        try {
            // Compter le nombre total d'alertes
            const totalAlerts = await this.prisma.client.stockAlert.count();
            
            // Compter par type
            const byType: Record<StockAlertType, number> = {
                [StockAlertType.LOW_STOCK]: 0,
                [StockAlertType.STOCK_OUT]: 0,
                [StockAlertType.FAILED_ORDER]: 0,
                [StockAlertType.QUEUED_ORDER]: 0,
                [StockAlertType.PROCESSED]: 0
            };
            
            for (const type of Object.values(StockAlertType)) {
                byType[type as StockAlertType] = await this.prisma.client.stockAlert.count({
                    where: { type }
                });
            }
            
            // Compter par produit
            const productAlertCounts = await this.prisma.client.stockAlert.groupBy({
                by: ['product_id'],
                _count: true
            });
            
            const byProduct: Record<string, number> = {};
            productAlertCounts.forEach(item => {
                byProduct[item.product_id] = item._count;
            });
            
            // Compter les alertes récentes
            const recentAlerts = await this.prisma.client.stockAlert.count({
                where: {
                    created_at: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 heures
                    }
                }
            });
            
            // Compter les alertes non lues
            const unreadAlerts = await this.prisma.client.stockAlert.count({
                where: {
                    metadata: {
                        path: ['read'],
                        equals: false
                    }
                }
            });
            
            return {
                totalAlerts,
                byType,
                byProduct,
                recentAlerts,
                unreadAlerts
            };
        } catch (error) {
            logger.error(`Error getting alert stats: ${error}`);
            throw error;
        }
    }

    /**
     * Nettoie les anciennes alertes
     */
    async cleanupOldAlerts(): Promise<number> {
        try {
            const expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() - this.config.alertExpirationDays);
            
            const result = await this.prisma.client.stockAlert.deleteMany({
                where: {
                    created_at: {
                        lt: expirationDate
                    },
                    type: {
                        notIn: [StockAlertType.QUEUED_ORDER] // Ne pas supprimer les commandes en attente
                    }
                }
            });
            
            logger.info(`Cleaned up ${result.count} old stock alerts`);
            return result.count;
        } catch (error) {
            logger.error(`Error cleaning up old alerts: ${error}`);
            throw error;
        }
    }

    /**
     * Configure le service
     */
    setConfig(config: Partial<StockAlertConfig>): void {
        this.config = {
            ...this.config,
            ...config
        };
    }

    /**
     * Récupère les alertes selon les filtres spécifiés
     */
    public async getAlerts(filters: any, limit: number = 50, offset: number = 0): Promise<StockAlert[]> {
        try {
            const alerts = await this.prisma.client.stockAlert.findMany({
                where: filters,
                take: limit,
                skip: offset,
                orderBy: {
                    created_at: 'desc'
                }
            });
            
            return alerts.map(alert => this.mapDatabaseAlertToStockAlert(alert));
        } catch (error) {
            logger.error('Erreur lors de la récupération des alertes', { error });
            throw error;
        }
    }

    /**
     * Compte le nombre d'alertes selon les filtres spécifiés
     */
    public async countAlerts(filters: any): Promise<number> {
        try {
            return await this.prisma.client.stockAlert.count({
                where: filters
            });
        } catch (error) {
            logger.error('Erreur lors du comptage des alertes', { error });
            throw error;
        }
    }

    /**
     * Récupère une alerte par son ID
     */
    public async getAlertById(id: string): Promise<StockAlert | null> {
        try {
            const alert = await this.prisma.client.stockAlert.findUnique({
                where: { id }
            });
            
            if (!alert) {
                return null;
            }
            
            return this.mapDatabaseAlertToStockAlert(alert);
        } catch (error) {
            logger.error('Erreur lors de la récupération de l\'alerte', { error, id });
            throw error;
        }
    }

    /**
     * Met à jour une alerte
     */
    public async updateAlert(id: string, data: StockAlertUpdate): Promise<StockAlert> {
        try {
            const updatedAlert = await this.prisma.client.stockAlert.update({
                where: { id },
                data
            });
            
            return this.mapDatabaseAlertToStockAlert(updatedAlert);
        } catch (error) {
            logger.error('Erreur lors de la mise à jour de l\'alerte', { error, id });
            throw error;
        }
    }

    /**
     * Récupère les alertes groupées par produit
     */
    public async getAlertsByProduct(): Promise<StockAlertsByProduct[]> {
        try {
            const results = await this.prisma.client.$queryRaw<StockAlertsByProduct[]>`
                SELECT "productId", COUNT(*) as count
                FROM "StockAlert"
                GROUP BY "productId"
                ORDER BY count DESC
            `;
            
            return results;
        } catch (error) {
            logger.error('Erreur lors de la récupération des alertes par produit', { error });
            throw error;
        }
    }

    /**
     * Crée une notification d'alerte
     */
    public async createAlertNotification(data: StockAlertNotificationCreate): Promise<StockAlertNotification> {
        try {
            const notification = await this.prisma.client.stockAlertNotification.create({
                data: {
                    type: data.type,
                    productId: data.productId,
                    productName: data.productName,
                    message: data.message,
                    severity: data.severity,
                    timestamp: new Date(),
                    read: false,
                    metadata: data.metadata || {}
                }
            });
            
            return {
                id: notification.id,
                type: notification.type as StockAlertType,
                productId: notification.productId,
                productName: notification.productName,
                message: notification.message,
                severity: notification.severity as StockAlertSeverity,
                timestamp: notification.timestamp.toISOString(),
                read: notification.read,
                metadata: notification.metadata
            };
        } catch (error) {
            logger.error('Erreur lors de la création de la notification d\'alerte', { error });
            throw error;
        }
    }

    /**
     * Convertit une alerte de la base de données en objet StockAlert
     */
    private mapDatabaseAlertToStockAlert(alert: any): StockAlert {
        const metadata = alert.metadata as Partial<StockAlertMetadata> || {};
        
        return {
            id: alert.id,
            type: alert.type,
            productId: alert.product_id,
            quantity: alert.quantity,
            orderId: alert.order_id,
            createdAt: alert.created_at,
            updatedAt: alert.created_at, // Pas de champ updated_at dans le modèle
            read: metadata.read || false,
            metadata: metadata as StockAlertMetadata,
            severity: metadata.severity || StockAlertSeverity.MEDIUM,
            message: metadata.message || ''
        };
    }
} 