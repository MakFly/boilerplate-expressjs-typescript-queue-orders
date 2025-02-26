import prisma from '../../config/prisma';
import logger from '../../config/logger';
import { ServiceError } from '../../utils/errors';

// Définition de l'enum StockAdjustmentType localement
export enum StockAdjustmentType {
  ORDER = 'ORDER',
  RETURN = 'RETURN',
  MANUAL = 'MANUAL',
  INVENTORY = 'INVENTORY'
}

export interface StockTransaction {
  productId: string;
  quantity: number;
  type: StockAdjustmentType;
  reference?: string;
  notes?: string;
}

export class StockTransactionService {
  /**
   * Crée une transaction de stock et met à jour le stock du produit
   */
  async createTransaction(data: StockTransaction) {
    try {
      // Vérifier que le produit existe
      const product = await prisma.product.findUnique({
        where: { id: data.productId }
      });

      if (!product) {
        throw new ServiceError(`Product with ID ${data.productId} not found`, 404);
      }

      // Calculer le nouveau stock
      const newStock = product.stock + data.quantity;
      
      // Mettre à jour le produit et créer la transaction en une seule transaction
      const result = await prisma.$transaction([
        prisma.product.update({
          where: { id: data.productId },
          data: { stock: newStock }
        }),
        prisma.stockTransaction.create({
          data: {
            productId: data.productId,
            quantity: data.quantity,
            type: data.type,
            reference: data.reference || null,
            notes: data.notes || null,
            previousStock: product.stock,
            newStock
          }
        })
      ]);

      logger.info(`Stock updated for product ${data.productId}: ${product.stock} → ${newStock}`, {
        productId: data.productId,
        adjustment: data.quantity,
        type: data.type
      });

      return result[1]; // Retourner la transaction créée
    } catch (error) {
      logger.error(`Error creating stock transaction: ${error instanceof Error ? error.message : 'Unknown error'}`, { 
        error,
        data 
      });
      throw error;
    }
  }

  /**
   * Récupère toutes les transactions de stock
   */
  async getTransactions() {
    try {
      const transactions = await prisma.stockTransaction.findMany({
        include: {
          product: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      
      return transactions;
    } catch (error) {
      logger.error(`Error fetching stock transactions: ${error instanceof Error ? error.message : 'Unknown error'}`, { error });
      throw error;
    }
  }
} 