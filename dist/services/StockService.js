"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StockService = void 0;
const StockAlertService_1 = require("./StockAlertService");
const logger_1 = __importDefault(require("../utils/logger"));
class StockService {
    constructor(stockRepository, queueService, prismaService, stockAlertService) {
        this.stockRepository = stockRepository;
        this.queueService = queueService;
        this.prismaService = prismaService;
        this.stockAlertService = stockAlertService;
        // Créer le service d'alertes s'il n'est pas fourni
        if (!this.stockAlertService) {
            this.stockAlertService = new StockAlertService_1.StockAlertService(prismaService, queueService);
        }
    }
    async checkStockAvailability(productId, quantity) {
        try {
            const currentStock = await this.stockRepository.getStockLevel(productId);
            return currentStock >= quantity;
        }
        catch (error) {
            logger_1.default.error(`Error checking stock availability for product ${productId}:`, error);
            throw error;
        }
    }
    async updateStockLevel(productId, quantity) {
        try {
            const newStockLevel = await this.stockRepository.updateStock(productId, quantity);
            // Vérifier si une alerte de stock bas est nécessaire
            await this.stockAlertService.checkLowStockAlert(productId, newStockLevel);
            return newStockLevel;
        }
        catch (error) {
            logger_1.default.error(`Error updating stock level for product ${productId}:`, error);
            throw error;
        }
    }
    async processStockAlert(alert) {
        try {
            // Cette méthode est maintenant un simple relais vers le service d'alertes
            // Elle est conservée pour la compatibilité avec le code existant
            logger_1.default.info(`Relaying stock alert for product ${alert.productId} to alert service`);
            // Selon le type d'alerte, on peut effectuer des actions spécifiques
            switch (alert.type) {
                case 'LOW_STOCK':
                case 'STOCK_OUT':
                    // Ces alertes sont déjà traitées par le StockAlertService
                    break;
                default:
                    logger_1.default.warn(`Unknown alert type: ${alert.type}`);
            }
        }
        catch (error) {
            logger_1.default.error('Error processing stock alert:', error);
            throw error;
        }
    }
    async createQueuedOrderAlert(productId, quantity, orderId) {
        try {
            // Déléguer au service d'alertes
            await this.stockAlertService.createQueuedOrderAlert(productId, quantity, orderId);
        }
        catch (error) {
            logger_1.default.error(`Error creating queued order alert for product ${productId}:`, error);
            throw error;
        }
    }
    /**
     * Vérifie et met à jour le stock pour une commande
     * Crée les alertes nécessaires
     */
    async processOrderStock(orderId, items) {
        try {
            let success = true;
            for (const item of items) {
                // Ignorer les produits queuables (ils sont traités séparément)
                if (item.isQueuable) {
                    continue;
                }
                // Récupérer le produit avec son stock actuel
                const product = await this.prismaService.client.product.findUnique({
                    where: { id: item.productId },
                    select: { id: true, name: true, stock: true }
                });
                if (!product) {
                    logger_1.default.error(`Product ${item.productId} not found when processing order stock`);
                    success = false;
                    continue;
                }
                // Vérifier si le stock est suffisant
                if (product.stock < item.quantity) {
                    logger_1.default.error(`Insufficient stock for product ${item.productId}: ${product.stock} < ${item.quantity}`);
                    // Créer une alerte d'échec
                    await this.stockAlertService.createFailedOrderAlert(item.productId, item.quantity, "Stock insuffisant", { orderId });
                    success = false;
                    continue;
                }
                // Mettre à jour le stock
                const newStock = product.stock - item.quantity;
                await this.prismaService.client.product.update({
                    where: { id: item.productId },
                    data: { stock: newStock }
                });
                // Vérifier si une alerte de stock bas est nécessaire
                await this.stockAlertService.checkLowStockAlert(item.productId, newStock, item.quantity, { orderId });
            }
            return success;
        }
        catch (error) {
            logger_1.default.error(`Error processing order stock for order ${orderId}:`, error);
            throw error;
        }
    }
}
exports.StockService = StockService;
