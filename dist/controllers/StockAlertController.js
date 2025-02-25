"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StockAlertController = void 0;
const stock_types_1 = require("../types/stock.types");
const AppError_1 = require("../utils/AppError");
const logger_1 = require("../utils/logger");
class StockAlertController {
    constructor(stockAlertService, prismaService, queueService) {
        this.stockAlertService = stockAlertService;
        this.prismaService = prismaService;
        this.queueService = queueService;
    }
    /**
     * Récupère toutes les alertes de stock avec filtres optionnels
     */
    async getAllAlerts(params) {
        try {
            const { limit, offset, type, productId } = params;
            const filters = {};
            if (type) {
                filters.type = type;
            }
            if (productId) {
                filters.productId = productId;
            }
            const [alerts, total] = await Promise.all([
                this.stockAlertService.getAlerts(filters, limit, offset),
                this.stockAlertService.countAlerts(filters)
            ]);
            // Enrichir les alertes avec les informations du produit
            const enrichedAlerts = await Promise.all(alerts.map(async (alert) => {
                const product = await this.prismaService.client.product.findUnique({
                    where: { id: alert.productId },
                    select: {
                        id: true,
                        name: true,
                        stock: true,
                        is_queuable: true
                    }
                });
                return {
                    ...alert,
                    product
                };
            }));
            return {
                data: enrichedAlerts,
                pagination: {
                    total,
                    limit,
                    offset,
                    hasMore: offset + limit < total
                }
            };
        }
        catch (error) {
            logger_1.logger.error('Erreur lors de la récupération des alertes de stock', { error });
            throw error;
        }
    }
    /**
     * Récupère les statistiques des alertes
     */
    async getAlertStats() {
        try {
            const totalAlerts = await this.stockAlertService.countAlerts({});
            // Compter par type
            const byType = {};
            for (const type of Object.values(stock_types_1.StockAlertType)) {
                byType[type] = await this.stockAlertService.countAlerts({ type });
            }
            // Compter par produit (top produits avec alertes)
            const productAlerts = await this.stockAlertService.getAlertsByProduct();
            const byProduct = {};
            productAlerts.forEach(item => {
                byProduct[item.productId] = item.count;
            });
            // Alertes récentes (dernières 24h)
            const oneDayAgo = new Date();
            oneDayAgo.setDate(oneDayAgo.getDate() - 1);
            const recentAlerts = await this.stockAlertService.countAlerts({
                createdAt: { gte: oneDayAgo }
            });
            // Alertes non lues
            const unreadAlerts = await this.stockAlertService.countAlerts({
                read: false
            });
            return {
                totalAlerts,
                byType,
                byProduct,
                recentAlerts,
                unreadAlerts
            };
        }
        catch (error) {
            logger_1.logger.error('Erreur lors de la récupération des statistiques d\'alertes', { error });
            throw error;
        }
    }
    /**
     * Récupère les alertes critiques (HIGH ou CRITICAL)
     */
    async getCriticalAlerts() {
        try {
            const criticalAlerts = await this.stockAlertService.getAlerts({
                OR: [
                    { severity: stock_types_1.StockAlertSeverity.HIGH },
                    { severity: stock_types_1.StockAlertSeverity.CRITICAL }
                ]
            });
            // Enrichir les alertes avec les informations du produit
            const enrichedAlerts = await Promise.all(criticalAlerts.map(async (alert) => {
                const product = await this.prismaService.client.product.findUnique({
                    where: { id: alert.productId },
                    select: {
                        id: true,
                        name: true,
                        stock: true
                    }
                });
                return {
                    ...alert,
                    product
                };
            }));
            return enrichedAlerts;
        }
        catch (error) {
            logger_1.logger.error('Erreur lors de la récupération des alertes critiques', { error });
            throw error;
        }
    }
    /**
     * Récupère les dernières notifications d'alertes
     */
    async getRecentNotifications(limit = 20) {
        try {
            const notifications = await this.stockAlertService.getRecentNotifications(limit);
            return notifications.map(notification => ({
                alertId: notification.id,
                type: notification.type,
                productId: notification.productId,
                productName: notification.productName,
                message: notification.message,
                severity: notification.severity,
                timestamp: notification.timestamp,
                read: notification.read,
                metadata: notification.metadata
            }));
        }
        catch (error) {
            logger_1.logger.error('Erreur lors de la récupération des notifications récentes', { error });
            throw error;
        }
    }
    /**
     * Marque une alerte comme lue
     */
    async markAlertAsRead(alertId) {
        try {
            if (!alertId) {
                throw new AppError_1.AppError('ID d\'alerte manquant', 400);
            }
            const alert = await this.stockAlertService.getAlertById(alertId);
            if (!alert) {
                throw new AppError_1.AppError(`Alerte avec l'ID ${alertId} non trouvée`, 404);
            }
            await this.stockAlertService.markAlertAsRead(alertId);
            return true;
        }
        catch (error) {
            logger_1.logger.error('Erreur lors du marquage de l\'alerte comme lue', { error, alertId });
            throw error;
        }
    }
    /**
     * Traite une commande en file d'attente
     */
    async processQueuedOrder(orderId) {
        try {
            if (!orderId) {
                throw new AppError_1.AppError('ID de commande manquant', 400);
            }
            // Vérifier si la commande existe et est en file d'attente
            const order = await this.prismaService.client.order.findUnique({
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
                throw new AppError_1.AppError(`Commande avec l'ID ${orderId} non trouvée`, 404);
            }
            // Récupérer les alertes associées à cette commande
            const alerts = await this.stockAlertService.getAlerts({
                orderId,
                type: stock_types_1.StockAlertType.QUEUED_ORDER
            });
            if (alerts.length === 0) {
                throw new AppError_1.AppError(`Aucune alerte de file d'attente trouvée pour la commande ${orderId}`, 404);
            }
            // Marquer les alertes comme traitées
            await Promise.all(alerts.map(alert => this.stockAlertService.updateAlert(alert.id, {
                type: stock_types_1.StockAlertType.PROCESSED,
                metadata: {
                    ...alert.metadata,
                    processedAt: new Date().toISOString(),
                    previousType: alert.type
                }
            })));
            // Déplacer la commande de la file d'attente vers la file standard
            await this.queueService.moveOrderFromQueueToStandard(orderId);
            // Créer une notification pour indiquer que la commande a été traitée
            await this.stockAlertService.createAlertNotification({
                type: stock_types_1.StockAlertType.PROCESSED,
                productId: alerts[0].productId,
                productName: order.items[0]?.product?.name || 'Produit inconnu',
                message: `Commande ${orderId} traitée manuellement`,
                severity: stock_types_1.StockAlertSeverity.LOW,
                metadata: {
                    orderId,
                    processedAt: new Date().toISOString()
                }
            });
            return {
                order,
                alerts
            };
        }
        catch (error) {
            logger_1.logger.error('Erreur lors du traitement de la commande en file d\'attente', { error, orderId });
            throw error;
        }
    }
}
exports.StockAlertController = StockAlertController;
