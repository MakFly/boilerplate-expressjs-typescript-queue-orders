import { StockRepository } from '../../repositories/StockRepository';
import { PrismaService } from '../PrismaService';
import { StockAlertService } from './StockAlertService';
import { StockTransactionService, StockAdjustmentType } from './StockTransactionService';
import logger from '../../utils/logger';
import { StockAlertType } from '@prisma/client';

export class StockService {
    constructor(
        private stockRepository: StockRepository,
        private prismaService: PrismaService,
        private stockAlertService?: StockAlertService,
        private stockTransactionService?: StockTransactionService
    ) {
        // Créer le service d'alertes s'il n'est pas fourni
        if (!this.stockAlertService) {
            this.stockAlertService = new StockAlertService(prismaService);
        }
        if (!this.stockTransactionService) {
            this.stockTransactionService = new StockTransactionService();
        }
    }

    async checkStockAvailability(productId: string, quantity: number): Promise<boolean> {
        try {
            const currentStock = await this.stockRepository.getStockLevel(productId);
            return currentStock >= quantity;
        } catch (error) {
            logger.error(`Error checking stock availability for product ${productId}:`, error);
            throw error;
        }
    }

    /**
     * Met à jour le stock d'un produit et enregistre la transaction
     */
    async updateStock(
        productId: string, 
        quantity: number, 
        type: StockAdjustmentType, 
        reference?: string, 
        notes?: string
    ): Promise<boolean> {
        try {
            // Récupérer le produit avec son stock actuel
            const product = await this.prismaService.client.product.findUnique({
                where: { id: productId },
                select: { id: true, name: true, stock: true }
            });
            
            if (!product) {
                logger.error(`Product ${productId} not found when updating stock`);
                return false;
            }
            
            // Créer la transaction de stock qui mettra à jour le stock du produit
            await this.stockTransactionService!.createTransaction({
                productId,
                quantity,
                type,
                reference,
                notes
            });
            
            // Vérifier si une alerte de stock bas est nécessaire
            const newStock = product.stock + quantity;
            if (quantity < 0) { // Si c'est une diminution de stock
                await this.stockAlertService!.checkLowStockAlert(
                    productId,
                    newStock,
                    Math.abs(quantity),
                    { orderId: reference }
                );
            }
            
            return true;
        } catch (error) {
            logger.error(`Error updating stock for product ${productId}:`, error);
            throw error;
        }
    }

    async processStockAlert(alert: any): Promise<void> {
        try {
            // Cette méthode est maintenant un simple relais vers le service d'alertes
            // Elle est conservée pour la compatibilité avec le code existant
            logger.info(`Processing stock alert for product ${alert.productId}`);
            
            // Créer l'alerte directement via le service d'alertes
            switch (alert.type) {
                case StockAlertType.LOW_STOCK:
                    await this.stockAlertService!.createAlert({
                        type: StockAlertType.LOW_STOCK,
                        productId: alert.productId,
                        quantity: alert.quantity,
                        severity: alert.severity || 'HIGH',
                        message: alert.message || `Stock bas pour le produit ${alert.productId}`,
                        metadata: alert.metadata
                    });
                    break;
                case StockAlertType.STOCK_OUT:
                    await this.stockAlertService!.createAlert({
                        type: StockAlertType.STOCK_OUT,
                        productId: alert.productId,
                        quantity: 0,
                        severity: alert.severity || 'CRITICAL',
                        message: alert.message || `Rupture de stock pour le produit ${alert.productId}`,
                        metadata: alert.metadata
                    });
                    break;
                default:
                    logger.warn(`Unknown alert type: ${alert.type}`);
            }
        } catch (error) {
            logger.error(`Error processing stock alert: ${error}`);
            throw error;
        }
    }

    async createQueuedOrderAlert(productId: string, quantity: number, orderId: string): Promise<void> {
        try {
            // Créer directement une alerte de commande en file d'attente
            await this.stockAlertService!.createQueuedOrderAlert(productId, quantity, orderId);
            logger.info(`Queued order alert created for product ${productId} (order ${orderId})`);
        } catch (error) {
            logger.error(`Error creating queued order alert: ${error}`);
            throw error;
        }
    }

    /**
     * Vérifie et met à jour le stock pour une commande
     * Crée les alertes nécessaires
     */
    async processOrderStock(
        orderId: string,
        items: Array<{ productId: string; quantity: number; isQueuable: boolean }>
    ): Promise<boolean> {
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
                    logger.error(`Product ${item.productId} not found when processing order stock`);
                    success = false;
                    continue;
                }
                
                // Vérifier si le stock est suffisant
                if (product.stock < item.quantity) {
                    logger.error(`Insufficient stock for product ${item.productId}: ${product.stock} < ${item.quantity}`);
                    
                    // Créer une alerte d'échec
                    await this.stockAlertService!.createFailedOrderAlert(
                        item.productId,
                        item.quantity,
                        "Stock insuffisant",
                        { orderId }
                    );
                    
                    success = false;
                    continue;
                }
                
                // Mettre à jour le stock et enregistrer la transaction
                await this.updateStock(
                    item.productId,
                    -item.quantity, // Valeur négative car c'est une sortie de stock
                    StockAdjustmentType.ORDER,
                    orderId,
                    `Commande #${orderId.substring(0, 8).toUpperCase()}`
                );
            }
            
            return success;
        } catch (error) {
            logger.error(`Error processing order stock for order ${orderId}:`, error);
            throw error;
        }
    }
}