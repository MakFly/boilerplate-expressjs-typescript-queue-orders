import { PrismaClient, Prisma } from "@prisma/client";
import { CreateOrderDto } from "../dto/order.dto";
import { StockAlertService } from "./stocks/StockAlertService";
import { PrismaService } from "./PrismaService";
import { QueueService } from "./QueueService";
import { ApiError } from "../utils/ApiError";
import logger from "../utils/logger";
import {
  OrderStatus,
  OrderWithItems,
  OrderResponse,
} from "../types/order.types";
import { getWebSocketController } from "../controllers/websocket.controller";
import { StockAlertType, StockAlertSeverity } from "../types/stock.types";

export class OrderService {
  private prisma: PrismaClient;
  private stockAlertService: StockAlertService;
  private prismaService: PrismaService;
  private queueService: QueueService;

  constructor() {
    this.prismaService = new PrismaService();
    this.prisma = this.prismaService.client;
    this.stockAlertService = new StockAlertService(this.prismaService);
    this.queueService = QueueService.getInstance();
  }

  /**
   * Récupère toutes les commandes
   */
  async getAllOrders(): Promise<OrderWithItems[]> {
    try {
      return (await this.prisma.order.findMany({
        include: {
          user: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      })) as OrderWithItems[];
    } catch (error) {
      logger.error("Erreur lors de la récupération des commandes:", error);
      throw new ApiError(500, "Impossible de récupérer les commandes");
    }
  }

  /**
   * Récupère une commande par son ID
   */
  async getOrderById(id: string): Promise<OrderWithItems> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id },
        include: {
          user: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!order) {
        throw new ApiError(404, "Commande non trouvée");
      }

      return order as OrderWithItems;
    } catch (error) {
      if (error instanceof ApiError) throw error;

      logger.error(
        `Erreur lors de la récupération de la commande ${id}:`,
        error
      );
      throw new ApiError(500, "Impossible de récupérer la commande");
    }
  }

  /**
   * Crée une nouvelle commande avec gestion de stock
   */
  async createOrder(orderData: CreateOrderDto): Promise<OrderResponse> {
    try {
      // Validation des produits
      if (!orderData.items || orderData.items.length === 0) {
        throw new ApiError(
          400,
          "La commande doit contenir au moins un produit"
        );
      }

      // Vérifier si l'utilisateur existe
      const user = await this.prisma.user.findUnique({
        where: { id: orderData.userId }
      });

      if (!user) {
        throw new ApiError(400, "Utilisateur non trouvé");
      }

      // Récupérer les informations sur les produits
      const productIds = orderData.items.map((item: { productId: string }) => item.productId);
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
      });

      // Vérifier que tous les produits existent
      if (products.length !== productIds.length) {
        const missingProducts = productIds.filter(
          (id: string) => !products.find((p) => p.id === id)
        );
        throw new ApiError(
          400,
          `Produits non trouvés: ${missingProducts.join(", ")}`
        );
      }

      // Calculer le montant total
      const totalAmount = orderData.items.reduce((total: number, item: { productId: string, quantity: number }) => {
        const product = products.find((p) => p.id === item.productId);
        if (!product) return total;
        return total + item.quantity * product.price;
      }, 0);

      // Vérifier si des produits sont queuables
      const hasQueuableProducts = products.some(
        (product) => product.is_queuable
      );

      // Créer la commande
      const order = (await this.prisma.order.create({
        data: {
          userId: orderData.userId,
          status: hasQueuableProducts ? "PENDING" : "CONFIRMED",
          totalAmount,
          items: {
            create: orderData.items.map((item: { productId: string, quantity: number }) => {
              const product = products.find((p) => p.id === item.productId);
              if (!product) {
                throw new ApiError(
                  400,
                  `Produit non trouvé: ${item.productId}`
                );
              }
              return {
                productId: item.productId,
                quantity: item.quantity,
                price: product.price,
              };
            }),
          },
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      })) as OrderWithItems;

      // Vérifier le stock et créer les alertes nécessaires
      for (const item of order.items) {
        const product = products.find((p) => p.id === item.productId);
        if (!product) continue;

        // Pour les produits non-queuables, vérifier si le stock est bas
        if (!product.is_queuable) {
          await this.stockAlertService.checkLowStockAlert(
            item.productId,
            product.stock,
            item.quantity,
            { orderId: order.id }
          );
        }
        
        // Pour les produits queuables, créer une alerte de commande en file d'attente
        if (product.is_queuable) {
          await this.stockAlertService.createQueuedOrderAlert(
            item.productId,
            item.quantity,
            order.id
          );
        }
      }

      // Notifier les clients via WebSocket
      const wsController = getWebSocketController();
      if (wsController) {
        wsController.broadcastNewOrder(order);
      }

      if (hasQueuableProducts) {
        return {
          status: "PENDING",
          message: "Commande en attente de validation manuelle",
          order,
        };
      }

      return {
        status: "CONFIRMED",
        message: "Commande confirmée",
        order,
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        logger.error("Erreur de base de données:", error);
        if (error.code === "P2002") {
          throw new ApiError(400, "Une commande similaire existe déjà");
        }
        if (error.code === "P2003") {
          throw new ApiError(400, "Un ou plusieurs produits n'existent pas");
        }
      }

      logger.error("Erreur lors de la création de la commande:", error);
      throw new ApiError(500, "Impossible de créer la commande");
    }
  }

  /**
   * Met à jour le statut d'une commande
   */
  async updateOrderStatus(
    id: string,
    status: OrderStatus
  ): Promise<OrderWithItems> {
    try {
      const order = await this.prisma.order.update({
        where: { id },
        data: { status },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!order) {
        logger.error(
          `Erreur lors de la mise à jour du statut de la commande ${id}: Commande non trouvée`
        );
        throw new ApiError(404, "Commande non trouvée");
      }

      // Si la commande est annulée, notifier via WebSocket
      if (status === "CANCELLED") {
        logger.info(`Commande ${id} annulée, notification via WebSocket...`);
        const wsController = getWebSocketController();
        if (wsController) {
          const orderNumber = id.substring(0, 8).toUpperCase();
          wsController.broadcastOrderStatus(id, orderNumber, "CANCELLED");
        }
        
        // Créer une alerte de stock pour la commande annulée
        await this.createStockAlertForOrder(order, "CANCELLED");
      }
      
      // Si la commande est confirmée ou en cours de traitement, vérifier les stocks
      if (status === "CONFIRMED" || status === "PROCESSING") {
        await this.checkStockLevelsForOrder(order);
      }
      
      // Si la commande est terminée, mettre à jour les stocks et créer des alertes si nécessaire
      if (status === "COMPLETED") {
        await this.updateStocksAndCreateAlerts(order);
      }

      return order as OrderWithItems;
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          throw new ApiError(404, "Commande non trouvée");
        }
      }

      logger.error(
        `Erreur lors de la mise à jour du statut de la commande ${id}:`,
        error
      );
      throw new ApiError(
        500,
        "Impossible de mettre à jour le statut de la commande"
      );
    }
  }

  /**
   * Supprime une commande
   */
  async deleteOrder(id: string) {
    try {
      await this.prisma.order.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          throw new ApiError(404, "Commande non trouvée");
        }
      }

      logger.error(
        `Erreur lors de la suppression de la commande ${id}: Commande non trouvée`,
        error
      );
      throw new ApiError(500, "Impossible de supprimer la commande");
    }
  }

  async confirmOrder(orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) {
        throw new Error("Commande non trouvée");
      }

      if (order.status !== "PENDING") {
        throw new Error(`La commande est ${order.status}`);
      }

      // Vérifier une dernière fois les stocks
      for (const item of order.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { id: true, stock: true, is_queuable: true },
        });

        if (!product) continue;

        // Si le produit est queuable, la commande doit rester en PENDING
        if (product.is_queuable) {
          return order;
        }

        if (product.stock < item.quantity) {
          await tx.order.update({
            where: { id: orderId },
            data: {
              status: "CANCELLED",
              cancellationReason: "Stock insuffisant",
            },
          });
          throw new Error(
            `Stock insuffisant pour le produit ${item.productId}`
          );
        }
      }

      return tx.order.update({
        where: { id: orderId },
        data: { status: "CONFIRMED" },
      });
    });
  }

  /**
   * Validation manuelle d'une commande par un contrôleur
   * Cette méthode ne peut être appelée que pour des commandes contenant des produits queuables
   */
  async validateOrderManually(orderId: string): Promise<OrderResponse> {
    return this.prisma.$transaction(async (tx) => {
      // Récupérer la commande avec ses items
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!order) {
        throw new ApiError(404, "Commande non trouvée");
      }

      if (order.status !== "PENDING") {
        throw new ApiError(
          400,
          `La commande ne peut pas être validée car elle est ${order.status}`
        );
      }

      // Vérifier que la commande contient au moins un produit queuable
      const hasQueuableProducts = order.items.some(
        (item) => item.product.is_queuable
      );
      if (!hasQueuableProducts) {
        throw new ApiError(
          400,
          "Cette commande ne contient pas de produits queuables et ne peut pas être validée manuellement"
        );
      }

      // Vérifier les stocks pour TOUS les produits, qu'ils soient queuables ou non
      for (const item of order.items) {
        const product = item.product;

        // Vérifier le stock pour tous les produits
        if (product.stock < item.quantity) {
          throw new ApiError(
            400,
            `Stock insuffisant pour le produit ${product.name} (stock actuel: ${product.stock}, quantité demandée: ${item.quantity})`
          );
        }

        // Mettre à jour le stock
        await tx.product.update({
          where: { id: product.id },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });

        // Vérifier si une alerte de stock bas est nécessaire
        const newStock = product.stock - item.quantity;
        await this.stockAlertService.checkLowStockAlert(
          product.id,
          newStock,
          item.quantity,
          { orderId }
        );
      }

      // Confirmer la commande
      const updatedOrder = (await tx.order.update({
        where: { id: orderId },
        data: {
          status: "CONFIRMED",
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      })) as OrderWithItems;

      // Marquer les alertes de commande en file d'attente comme traitées
      await this.stockAlertService.markQueuedOrderAsProcessed(
        orderId,
        {
          processedBy: "CONTROLLER",
          validationType: "MANUAL",
        }
      );

      // Déplacer la commande de la file d'attente queuable vers la file standard
      // pour qu'elle soit traitée par le worker standard
      try {
        logger.info(`Validation manuelle de la commande ${orderId}`);
        const moved = await this.queueService.moveToStandardQueue(orderId);
        if (moved) {
          logger.info(`✅ Commande ${orderId} déplacée vers la file standard`);
        } else {
          logger.warn(`Commande ${orderId} non trouvée dans la file queuable`);
          
          // Vérifier si la commande a déjà été traitée
          const existsInStandard = await this.queueService.checkOrderInStandardQueue(orderId);
          if (existsInStandard) {
            logger.info(`La commande ${orderId} est déjà dans la file standard, elle a probablement déjà été déplacée`);
          } else {
            logger.warn(`La commande ${orderId} n'est ni dans la file queuable ni dans la file standard. Elle a peut-être déjà été traitée par un worker.`);
          }
        }
      } catch (error) {
        logger.error(`Erreur lors du déplacement de la commande ${orderId}:`, error);
        // On ne bloque pas la validation si le déplacement échoue
      }

      return {
        status: "CONFIRMED",
        message: "Commande validée manuellement avec succès",
        order: updatedOrder,
      };
    });
  }

  /**
   * Récupère des statistiques sur les commandes
   * @returns Statistiques des commandes
   */
  async getOrderStats() {
    try {
      // Récupérer le nombre total de commandes
      const totalOrders = await this.prisma.order.count();

      // Récupérer le nombre de commandes par statut
      const ordersByStatus = await this.prisma.order.groupBy({
        by: ['status'],
        _count: {
          id: true
        }
      });

      // Récupérer le montant total des commandes
      const totalAmount = await this.prisma.order.aggregate({
        _sum: {
          totalAmount: true
        }
      });

      // Récupérer le montant moyen des commandes
      const averageAmount = await this.prisma.order.aggregate({
        _avg: {
          totalAmount: true
        }
      });

      // Récupérer les 5 produits les plus commandés
      const topProducts = await this.prisma.orderItem.groupBy({
        by: ['productId'],
        _sum: {
          quantity: true
        },
        orderBy: {
          _sum: {
            quantity: 'desc'
          }
        },
        take: 5
      });

      // Récupérer les détails des produits les plus commandés
      const topProductsDetails = await Promise.all(
        topProducts.map(async (item) => {
          const product = await this.prisma.product.findUnique({
            where: { id: item.productId }
          });
          return {
            productId: item.productId,
            productName: product?.name || 'Produit inconnu',
            totalQuantity: item._sum.quantity
          };
        })
      );

      // Récupérer les commandes des 30 derniers jours
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentOrders = await this.prisma.order.findMany({
        where: {
          createdAt: {
            gte: thirtyDaysAgo
          }
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      // Agréger les commandes par jour pour les 30 derniers jours
      const ordersByDay = recentOrders.reduce((acc, order) => {
        const date = order.createdAt.toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = {
            count: 0,
            totalAmount: 0
          };
        }
        acc[date].count += 1;
        acc[date].totalAmount += order.totalAmount;
        return acc;
      }, {} as Record<string, { count: number, totalAmount: number }>);

      return {
        totalOrders,
        ordersByStatus: ordersByStatus.map(status => ({
          status: status.status,
          count: status._count.id
        })),
        totalAmount: totalAmount._sum.totalAmount || 0,
        averageAmount: averageAmount._avg.totalAmount || 0,
        topProducts: topProductsDetails,
        ordersByDay: Object.entries(ordersByDay).map(([date, data]) => ({
          date,
          count: data.count,
          totalAmount: data.totalAmount
        }))
      };
    } catch (error) {
      logger.error("Erreur lors de la récupération des statistiques des commandes:", error);
      throw new ApiError(500, "Impossible de récupérer les statistiques des commandes");
    }
  }

  /**
   * Crée une alerte de stock pour une commande
   */
  private async createStockAlertForOrder(order: any, reason: string): Promise<void> {
    try {
      // Pour chaque produit dans la commande
      for (const item of order.items) {
        // Vérifier si le stock est bas ou nul après cette commande
        const product = item.product;
        
        // Déterminer le type d'alerte en fonction du statut de la commande
        let alertType: StockAlertType;
        let message: string;
        let severity: StockAlertSeverity;
        
        if (reason === "CANCELLED") {
          alertType = StockAlertType.FAILED_ORDER;
          message = `Commande ${order.id.substring(0, 8).toUpperCase()} annulée pour le produit ${product.name}`;
          severity = StockAlertSeverity.HIGH;
        } else if (product.stock <= 0) {
          alertType = StockAlertType.STOCK_OUT;
          message = `Stock épuisé pour le produit ${product.name} après la commande ${order.id.substring(0, 8).toUpperCase()}`;
          severity = StockAlertSeverity.CRITICAL;
        } else if (product.stock < 5) { // Seuil configurable
          alertType = StockAlertType.LOW_STOCK;
          message = `Stock bas (${product.stock} restants) pour le produit ${product.name} après la commande ${order.id.substring(0, 8).toUpperCase()}`;
          severity = StockAlertSeverity.MEDIUM;
        } else {
          // Pas d'alerte nécessaire si le stock est suffisant
          continue;
        }
        
        // Créer l'alerte via le service d'alerte de stock
        await this.stockAlertService.createAlert({
          type: alertType,
          productId: product.id,
          quantity: product.stock,
          orderId: order.id,
          severity: severity,
          message: message,
          metadata: {
            message,
            orderNumber: order.id.substring(0, 8).toUpperCase(),
            orderStatus: order.status,
            timestamp: new Date().toISOString()
          }
        });
        
        logger.info(`Alerte de stock créée pour le produit ${product.id} (${alertType})`);
      }
    } catch (error) {
      logger.error(`Erreur lors de la création d'alertes de stock pour la commande ${order.id}:`, error);
      // Ne pas propager l'erreur pour ne pas bloquer le traitement de la commande
    }
  }

  /**
   * Vérifie les niveaux de stock pour une commande et crée des alertes si nécessaire
   */
  private async checkStockLevelsForOrder(order: any): Promise<void> {
    try {
      for (const item of order.items) {
        const product = item.product;
        
        // Vérifier si le stock est suffisant
        if (product.stock < item.quantity) {
          // Créer une alerte de stock insuffisant
          await this.stockAlertService.createAlert({
            type: StockAlertType.QUEUED_ORDER,
            productId: product.id,
            quantity: item.quantity,
            orderId: order.id,
            severity: StockAlertSeverity.HIGH,
            message: `Stock insuffisant pour le produit ${product.name} (commande: ${order.id.substring(0, 8).toUpperCase()})`,
            metadata: {
              message: `Stock insuffisant pour le produit ${product.name} (commande: ${order.id.substring(0, 8).toUpperCase()})`,
              required: item.quantity,
              available: product.stock,
              orderNumber: order.id.substring(0, 8).toUpperCase(),
              timestamp: new Date().toISOString()
            }
          });
          
          logger.warn(`Stock insuffisant pour le produit ${product.id} (commande: ${order.id})`);
        }
      }
    } catch (error) {
      logger.error(`Erreur lors de la vérification des stocks pour la commande ${order.id}:`, error);
      // Ne pas propager l'erreur pour ne pas bloquer le traitement de la commande
    }
  }

  /**
   * Met à jour les stocks après une commande complétée et crée des alertes si nécessaire
   */
  private async updateStocksAndCreateAlerts(order: any): Promise<void> {
    try {
      for (const item of order.items) {
        const productId = item.productId;
        const quantity = item.quantity;
        
        // Mettre à jour le stock du produit
        const updatedProduct = await this.prisma.product.update({
          where: { id: productId },
          data: {
            stock: {
              decrement: quantity
            }
          }
        });
        
        // Vérifier si le stock est bas après la mise à jour
        if (updatedProduct.stock <= 0) {
          // Créer une alerte de stock épuisé
          await this.stockAlertService.createAlert({
            type: StockAlertType.STOCK_OUT,
            productId: updatedProduct.id,
            quantity: 0,
            orderId: order.id,
            severity: StockAlertSeverity.CRITICAL,
            message: `Stock épuisé pour le produit ${updatedProduct.name} après la commande ${order.id.substring(0, 8).toUpperCase()}`,
            metadata: {
              message: `Stock épuisé pour le produit ${updatedProduct.name} après la commande ${order.id.substring(0, 8).toUpperCase()}`,
              orderNumber: order.id.substring(0, 8).toUpperCase(),
              timestamp: new Date().toISOString()
            }
          });
          
          logger.warn(`Stock épuisé pour le produit ${updatedProduct.id}`);
        } else if (updatedProduct.stock < 5) { // Seuil configurable
          // Créer une alerte de stock bas
          await this.stockAlertService.createAlert({
            type: StockAlertType.LOW_STOCK,
            productId: updatedProduct.id,
            quantity: updatedProduct.stock,
            orderId: order.id,
            severity: StockAlertSeverity.MEDIUM,
            message: `Stock bas (${updatedProduct.stock} restants) pour le produit ${updatedProduct.name}`,
            metadata: {
              message: `Stock bas (${updatedProduct.stock} restants) pour le produit ${updatedProduct.name}`,
              orderNumber: order.id.substring(0, 8).toUpperCase(),
              timestamp: new Date().toISOString()
            }
          });
          
          logger.warn(`Stock bas pour le produit ${updatedProduct.id}: ${updatedProduct.stock} restants`);
        }
      }
    } catch (error) {
      logger.error(`Erreur lors de la mise à jour des stocks pour la commande ${order.id}:`, error);
      // Ne pas propager l'erreur pour ne pas bloquer le traitement de la commande
    }
  }
}
