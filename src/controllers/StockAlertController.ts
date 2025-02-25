import { StockAlertService } from '../services/StockAlertService';
import { PrismaService } from '../services/PrismaService';
import { QueueService } from '../services/QueueService';
import { StockAlertType, StockAlertSeverity } from '../types/stock.types';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

interface GetAlertsParams {
  limit: number;
  offset: number;
  type?: string;
  productId?: string;
}

export class StockAlertController {
  constructor(
    private stockAlertService: StockAlertService,
    private prismaService: PrismaService,
    private queueService: QueueService
  ) {}

  /**
   * Récupère toutes les alertes de stock avec filtres optionnels
   */
  async getAllAlerts(params: GetAlertsParams) {
    try {
      const { limit, offset, type, productId } = params;
      
      const filters: any = {};
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
      const enrichedAlerts = await Promise.all(
        alerts.map(async (alert) => {
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
        })
      );

      return {
        data: enrichedAlerts,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      };
    } catch (error) {
      logger.error('Erreur lors de la récupération des alertes de stock', { error });
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
      const byType: Record<string, number> = {};
      for (const type of Object.values(StockAlertType)) {
        byType[type] = await this.stockAlertService.countAlerts({ type });
      }
      
      // Compter par produit (top produits avec alertes)
      const productAlerts = await this.stockAlertService.getAlertsByProduct();
      const byProduct: Record<string, number> = {};
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
    } catch (error) {
      logger.error('Erreur lors de la récupération des statistiques d\'alertes', { error });
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
          { severity: StockAlertSeverity.HIGH },
          { severity: StockAlertSeverity.CRITICAL }
        ]
      });
      
      // Enrichir les alertes avec les informations du produit
      const enrichedAlerts = await Promise.all(
        criticalAlerts.map(async (alert) => {
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
        })
      );
      
      return enrichedAlerts;
    } catch (error) {
      logger.error('Erreur lors de la récupération des alertes critiques', { error });
      throw error;
    }
  }

  /**
   * Récupère les dernières notifications d'alertes
   */
  async getRecentNotifications(limit: number = 20) {
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
    } catch (error) {
      logger.error('Erreur lors de la récupération des notifications récentes', { error });
      throw error;
    }
  }

  /**
   * Marque une alerte comme lue
   */
  async markAlertAsRead(alertId: string) {
    try {
      if (!alertId) {
        throw new AppError('ID d\'alerte manquant', 400);
      }
      
      const alert = await this.stockAlertService.getAlertById(alertId);
      if (!alert) {
        throw new AppError(`Alerte avec l'ID ${alertId} non trouvée`, 404);
      }
      
      await this.stockAlertService.markAlertAsRead(alertId);
      
      return true;
    } catch (error) {
      logger.error('Erreur lors du marquage de l\'alerte comme lue', { error, alertId });
      throw error;
    }
  }

  /**
   * Traite une commande en file d'attente
   */
  async processQueuedOrder(orderId: string) {
    try {
      if (!orderId) {
        throw new AppError('ID de commande manquant', 400);
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
        throw new AppError(`Commande avec l'ID ${orderId} non trouvée`, 404);
      }
      
      // Récupérer les alertes associées à cette commande
      const alerts = await this.stockAlertService.getAlerts({
        orderId,
        type: StockAlertType.QUEUED_ORDER
      });
      
      if (alerts.length === 0) {
        throw new AppError(`Aucune alerte de file d'attente trouvée pour la commande ${orderId}`, 404);
      }
      
      // Marquer les alertes comme traitées
      await Promise.all(
        alerts.map(alert => 
          this.stockAlertService.updateAlert(alert.id, {
            type: StockAlertType.PROCESSED,
            metadata: {
              ...alert.metadata,
              processedAt: new Date().toISOString(),
              previousType: alert.type
            }
          })
        )
      );
      
      // Déplacer la commande de la file d'attente vers la file standard
      await this.queueService.moveOrderFromQueueToStandard(orderId);
      
      // Créer une notification pour indiquer que la commande a été traitée
      await this.stockAlertService.createAlertNotification({
        type: StockAlertType.PROCESSED,
        productId: alerts[0].productId,
        productName: order.items[0]?.product?.name || 'Produit inconnu',
        message: `Commande ${orderId} traitée manuellement`,
        severity: StockAlertSeverity.LOW,
        metadata: {
          orderId,
          processedAt: new Date().toISOString()
        }
      });
      
      return {
        order,
        alerts
      };
    } catch (error) {
      logger.error('Erreur lors du traitement de la commande en file d\'attente', { error, orderId });
      throw error;
    }
  }
} 