import { PrismaClient, StockTransaction } from '@prisma/client';
import { logger } from '../utils/logger';

// Définition de l'enum StockAdjustmentType localement
export enum StockAdjustmentType {
  MANUAL = 'MANUAL',
  ORDER = 'ORDER',
  RETURN = 'RETURN',
  INVENTORY = 'INVENTORY',
  ADJUSTMENT = 'ADJUSTMENT'
}

export class StockTransactionService {
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
      // Vérifier si une transaction similaire existe déjà pour les commandes
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
} 