import { PrismaClient, StockTransaction } from '@prisma/client';
import { StockAdjustmentType } from './stocks/StockTransactionService';
import { logger } from '../utils/logger';

export class StockService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Crée une transaction de stock
   */
  async createTransaction(data: {
    productId: string;
    quantity: number;
    type: StockAdjustmentType;
    reference?: string;
    notes?: string;
  }): Promise<StockTransaction> {
    try {
      // Vérifier si une transaction similaire existe déjà
      if (data.reference && data.type === StockAdjustmentType.ORDER) {
        const existingTransaction = await this.prisma.stockTransaction.findFirst({
          where: {
            productId: data.productId,
            reference: data.reference,
            type: data.type
          }
        });

        if (existingTransaction) {
          logger.warn(`Transaction de stock déjà existante pour le produit ${data.productId} avec la référence ${data.reference}, transaction ignorée`);
          return existingTransaction;
        }
      }

      // Récupérer le stock actuel du produit
      const product = await this.prisma.product.findUnique({
        where: { id: data.productId },
        select: { id: true, stock: true, name: true }
      });

      if (!product) {
        throw new Error(`Produit non trouvé: ${data.productId}`);
      }

      // Calculer le nouveau stock
      const newStock = product.stock + data.quantity;

      logger.info(`Création d'une transaction de stock pour le produit ${product.name} (ID: ${data.productId}): ${product.stock} → ${newStock} (${data.quantity > 0 ? '+' : ''}${data.quantity})`);

      // Créer la transaction
      const transaction = await this.prisma.stockTransaction.create({
        data: {
          productId: data.productId,
          quantity: data.quantity,
          type: data.type,
          reference: data.reference || null,
          notes: data.notes || null,
          previousStock: product.stock,
          newStock: newStock
        }
      });

      logger.info(`Transaction de stock créée avec succès: ${transaction.id}`);
      return transaction;
    } catch (error) {
      logger.error('Erreur lors de la création de la transaction de stock:', error);
      throw error;
    }
  }

  /**
   * Récupère toutes les transactions de stock pour un produit
   */
  async getTransactionsByProduct(productId: string): Promise<StockTransaction[]> {
    try {
      return await this.prisma.stockTransaction.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      logger.error(`Erreur lors de la récupération des transactions pour le produit ${productId}:`, error);
      throw error;
    }
  }

  /**
   * Récupère toutes les transactions de stock pour une commande
   */
  async getTransactionsByOrder(orderId: string): Promise<StockTransaction[]> {
    try {
      return await this.prisma.stockTransaction.findMany({
        where: { 
          reference: orderId,
          type: StockAdjustmentType.ORDER
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      logger.error(`Erreur lors de la récupération des transactions pour la commande ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Vérifie si une transaction de stock existe déjà pour un produit et une commande
   */
  async transactionExists(productId: string, orderId: string, type: StockAdjustmentType = StockAdjustmentType.ORDER): Promise<boolean> {
    try {
      const count = await this.prisma.stockTransaction.count({
        where: {
          productId,
          reference: orderId,
          type
        }
      });
      
      return count > 0;
    } catch (error) {
      logger.error(`Erreur lors de la vérification de l'existence d'une transaction pour le produit ${productId} et la commande ${orderId}:`, error);
      return false;
    }
  }

  /**
   * Traite le stock pour une commande
   */
  async processOrderStock(orderId: string, items: Array<{ productId: string, quantity: number }>) {
    try {
      logger.info(`Traitement du stock pour la commande ${orderId}`);
      
      // Récupérer les transactions existantes pour cette commande
      const existingTransactions = await this.getTransactionsByOrder(orderId);
      logger.info(`${existingTransactions.length} transactions existantes trouvées pour la commande ${orderId}`);
      
      for (const item of items) {
        // Vérifier si une transaction existe déjà pour ce produit
        const existingTransaction = existingTransactions.find(t => t.productId === item.productId);
        
        if (existingTransaction) {
          logger.info(`Transaction existante trouvée pour le produit ${item.productId}, pas de mise à jour nécessaire`);
          continue;
        }
        
        // Récupérer le produit
        const product = await this.prisma.product.findUnique({
          where: { id: item.productId }
        });
        
        if (!product) {
          logger.error(`Produit ${item.productId} non trouvé, impossible de mettre à jour le stock`);
          continue;
        }
        
        // Vérifier si le stock est suffisant
        if (product.stock < item.quantity) {
          logger.error(`Stock insuffisant pour le produit ${item.productId} (stock: ${product.stock}, quantité: ${item.quantity})`);
          continue;
        }
        
        // Mettre à jour le stock
        await this.prisma.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity
            }
          }
        });
        
        // Créer la transaction
        await this.createTransaction({
          productId: item.productId,
          quantity: -item.quantity,
          type: StockAdjustmentType.ORDER,
          reference: orderId,
          notes: `Commande traitée #${orderId.substring(0, 8).toUpperCase()}`
        });
        
        logger.info(`Stock mis à jour pour le produit ${item.productId}: -${item.quantity}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Erreur lors du traitement du stock pour la commande ${orderId}:`, error);
      throw error;
    }
  }
} 