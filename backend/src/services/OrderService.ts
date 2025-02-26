import { PrismaClient, Prisma } from "@prisma/client";
import { CreateOrderDto } from "../dto/order.dto";
import { StockAlertService } from "./stocks/StockAlertService";
import { StockTransactionService, StockAdjustmentType } from "./stocks/StockTransactionService";
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
  private stockTransactionService: StockTransactionService;
  private prismaService: PrismaService;
  private queueService: QueueService;

  constructor() {
    this.prismaService = new PrismaService();
    this.prisma = this.prismaService.client;
    this.stockAlertService = new StockAlertService(this.prismaService);
    this.stockTransactionService = new StockTransactionService();
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
      // Validation des données d'entrée
      if (!orderData) {
        logger.error("Données de commande manquantes");
        throw new ApiError(400, "Les données de commande sont requises");
      }

      if (!orderData.userId) {
        logger.error("UserId manquant dans la requête", { orderData });
        throw new ApiError(400, "L'identifiant de l'utilisateur (userId) est requis");
      }

      // Validation des produits
      if (!orderData.items || orderData.items.length === 0) {
        logger.error("Items manquants dans la requête", { orderData });
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
        logger.error(`Utilisateur non trouvé: ${orderData.userId}`);
        throw new ApiError(400, `Utilisateur non trouvé avec l'ID: ${orderData.userId}`);
      }

      // Récupérer les informations sur les produits
      const productIds = orderData.items.map((item: { productId: string }) => item.productId);
      logger.info(`Vérification des produits: ${productIds.join(', ')}`);
      
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
      });

      // Vérifier que tous les produits existent
      if (products.length !== productIds.length) {
        const missingProducts = productIds.filter(
          (id: string) => !products.find((p) => p.id === id)
        );
        logger.error(`Produits non trouvés: ${missingProducts.join(", ")}`, { orderData });
        throw new ApiError(
          400,
          `Produits non trouvés: ${missingProducts.join(", ")}`
        );
      }

      // Vérifier que tous les produits ont un stock suffisant (sauf s'ils sont queuables)
      for (const item of orderData.items) {
        const product = products.find((p) => p.id === item.productId);
        if (!product) continue;

        // Si le produit a un stock à zéro, refuser la commande même s'il est queuable
        if (product.stock === 0) {
          logger.error(`Stock insuffisant pour le produit ${product.name} (stock: ${product.stock}, quantité: ${item.quantity})`, { orderData });
          throw new ApiError(
            400,
            `Stock insuffisant pour le produit ${product.name} (stock actuel: ${product.stock}, quantité demandée: ${item.quantity})`
          );
        }

        // Si le produit n'est pas queuable et que son stock est inférieur à la quantité demandée
        if (!product.is_queuable && product.stock < item.quantity) {
          logger.error(`Stock insuffisant pour le produit ${product.name} (stock: ${product.stock}, quantité: ${item.quantity})`, { orderData });
          throw new ApiError(
            400,
            `Stock insuffisant pour le produit ${product.name} (stock actuel: ${product.stock}, quantité demandée: ${item.quantity})`
          );
        }
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

      logger.info(`Commande ${order.id} créée avec succès, mise à jour des stocks...`);

      // Mettre à jour les stocks pour les produits non-queuables
      for (const item of order.items) {
        const product = products.find((p) => p.id === item.productId);
        if (!product) continue;

        // Pour les produits non-queuables, mettre à jour le stock immédiatement
        if (!product.is_queuable) {
          logger.info(`Mise à jour du stock pour le produit non-queuable ${product.name} (ID: ${product.id}), quantité: ${item.quantity}`);
          
          try {
            // Vérifier si une transaction existe déjà pour ce produit et cette commande
            const existingTransaction = await this.prisma.stockTransaction.findFirst({
              where: {
                productId: item.productId,
                reference: order.id,
                type: StockAdjustmentType.ORDER
              }
            });
            
            if (existingTransaction) {
              logger.warn(`Transaction de stock déjà existante pour le produit ${item.productId} avec la référence ${order.id}, mise à jour ignorée`);
              continue;
            }
            
            // Utiliser une transaction Prisma pour garantir l'atomicité
            await this.prisma.$transaction(async (tx) => {
              // Récupérer le produit avec son stock actuel pour avoir la valeur la plus à jour
              const currentProduct = await tx.product.findUnique({
                where: { id: item.productId }
              });
              
              if (!currentProduct) {
                throw new Error(`Produit ${item.productId} non trouvé`);
              }
              
              // Mettre à jour le stock du produit
              const updatedProduct = await tx.product.update({
                where: { id: item.productId },
                data: {
                  stock: {
                    decrement: item.quantity
                  }
                }
              });
              
              // Enregistrer la transaction de stock
              await tx.stockTransaction.create({
                data: {
                  productId: item.productId,
                  quantity: -item.quantity, // Valeur négative car c'est une sortie de stock
                  type: StockAdjustmentType.ORDER,
                  reference: order.id,
                  notes: `Commande créée #${order.id.substring(0, 8).toUpperCase()}`,
                  previousStock: currentProduct.stock,
                  newStock: currentProduct.stock - item.quantity
                }
              });
              
              logger.info(`Stock mis à jour pour le produit ${item.productId}: ${currentProduct.stock} → ${updatedProduct.stock}`);
              
              // Vérifier si le stock est bas après la mise à jour
              await this.stockAlertService.checkLowStockAlert(
                item.productId,
                updatedProduct.stock,
                item.quantity,
                { orderId: order.id }
              );
            });
          } catch (error) {
            logger.error(`Erreur lors de la mise à jour du stock pour le produit ${item.productId}:`, error);
            // Ne pas bloquer la création de la commande si la mise à jour du stock échoue
          }
        }
        // Pour les produits queuables, créer une alerte de commande en file d'attente
        else {
          logger.info(`Produit queuable ${product.name} (ID: ${product.id}), pas de mise à jour de stock immédiate`);
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

      // Envoyer la commande à la file d'attente RabbitMQ si elle contient des produits queuables
      if (hasQueuableProducts) {
        try {
          // Préparer les données pour la file d'attente
          const queueItems = order.items.map(item => {
            const isQueuable = products.find(p => p.id === item.productId)?.is_queuable || false;
            return {
              productId: item.productId,
              quantity: item.quantity,
              isQueuable: isQueuable
            };
          });

          // Vérifier à nouveau si des produits sont queuables (double vérification)
          const containsQueuableItems = queueItems.some(item => item.isQueuable);
          
          if (!containsQueuableItems) {
            logger.warn(`La commande ${order.id} est marquée comme ayant des produits queuables, mais aucun produit queuable n'a été trouvé dans les items`);
          }

          // Envoyer à la file d'attente
          await this.queueService.addToQueue({
            type: 'STOCK_VERIFICATION',
            data: {
              orderId: order.id,
              items: queueItems,
              hasQueuableProducts: true,
              queuableItemsCount: queueItems.filter(item => item.isQueuable).length
            }
          });
          
          logger.info(`Commande ${order.id} avec produits queuables envoyée à RabbitMQ`);
          
          // Log détaillé des produits queuables
          const queuableProducts = queueItems.filter(item => item.isQueuable);
          if (queuableProducts.length > 0) {
            logger.debug(`Produits queuables dans la commande ${order.id}:`, queuableProducts);
          }
        } catch (error) {
          logger.error(`Erreur lors de l'envoi de la commande ${order.id} à RabbitMQ:`, error);
          // Ne pas bloquer la création de la commande si l'envoi à RabbitMQ échoue
        }

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
      
      // Message d'erreur plus détaillé
      if (error instanceof Error) {
        throw new ApiError(500, `Impossible de créer la commande: ${error.message}`);
      } else {
        throw new ApiError(500, "Impossible de créer la commande");
      }
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
        logger.info(`Commande ${id} marquée comme COMPLETED, vérification des transactions de stock...`);
        
        // Vérifier si des transactions de stock existent déjà pour cette commande
        const existingTransactions = await this.prisma.stockTransaction.findMany({
          where: {
            reference: id,
            type: StockAdjustmentType.ORDER
          }
        });

        // Vérifier si tous les produits non-queuables ont déjà des transactions
        const nonQueuableItems = order.items.filter(item => !item.product.is_queuable);
        const allItemsHaveTransactions = nonQueuableItems.every(item => 
          existingTransactions.some(t => t.productId === item.product.id)
        );

        if (allItemsHaveTransactions) {
          logger.info(`Tous les produits non-queuables de la commande ${id} ont déjà des transactions de stock, pas de mise à jour nécessaire`);
        } else if (existingTransactions.length > 0) {
          logger.info(`${existingTransactions.length} transactions de stock trouvées pour la commande ${id}, mais certains produits n'ont pas encore été traités`);
          await this.updateStocksAndCreateAlerts(order);
        } else {
          logger.info(`Aucune transaction de stock trouvée pour la commande ${id}, mise à jour des stocks...`);
          await this.updateStocksAndCreateAlerts(order);
        }
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
        throw new ApiError(404, `Commande ${orderId} non trouvée`);
      }

      if (order.status !== "PENDING") {
        throw new ApiError(
          400,
          `La commande ${orderId} ne peut pas être validée car elle n'est pas en attente (statut actuel: ${order.status})`
        );
      }

      // Vérifier si la commande contient au moins un produit queuable
      const hasQueuableProduct = order.items.some(
        (item) => item.product.is_queuable
      );

      if (!hasQueuableProduct) {
        throw new ApiError(
          400,
          `La commande ${orderId} ne contient aucun produit queuable, elle ne peut pas être validée manuellement`
        );
      }

      logger.info(`Validation manuelle de la commande ${orderId}`);

      // Récupérer les transactions de stock existantes pour cette commande
      const existingTransactions = await tx.stockTransaction.findMany({
        where: {
          reference: orderId,
          type: StockAdjustmentType.ORDER
        }
      });

      logger.info(`${existingTransactions.length} transactions de stock existantes trouvées pour la commande ${orderId}`);

      // Vérifier les stocks pour TOUS les produits, qu'ils soient queuables ou non
      for (const item of order.items) {
        const product = item.product;
        
        // Vérifier si une transaction existe déjà pour ce produit
        const existingTransaction = existingTransactions.find(t => t.productId === product.id);
        
        if (existingTransaction) {
          logger.info(`Transaction de stock déjà existante pour le produit ${product.id} dans la commande ${orderId}, pas de mise à jour nécessaire`);
          continue;
        }

        // Vérifier le stock pour tous les produits
        if (product.stock < item.quantity) {
          throw new ApiError(
            400,
            `Stock insuffisant pour le produit ${product.name} (stock actuel: ${product.stock}, quantité demandée: ${item.quantity})`
          );
        }
        
        logger.info(`Mise à jour du stock pour le produit ${product.name} (ID: ${product.id}), quantité: ${item.quantity}`);

        // Mettre à jour le stock
        const updatedProduct = await tx.product.update({
          where: { id: product.id },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });

        // Enregistrer la transaction de stock
        await tx.stockTransaction.create({
          data: {
            productId: product.id,
            quantity: -item.quantity, // Valeur négative car c'est une sortie de stock
            type: StockAdjustmentType.ORDER,
            reference: orderId,
            notes: `Commande validée manuellement`,
            previousStock: product.stock,
            newStock: product.stock - item.quantity
          }
        });

        logger.info(`Stock mis à jour pour le produit ${product.id}: ${product.stock} → ${updatedProduct.stock}`);

        // Vérifier si une alerte de stock bas est nécessaire
        const newStock = product.stock - item.quantity;
        await this.stockAlertService.checkLowStockAlert(
          product.id,
          newStock,
          item.quantity,
          { orderId }
        );
      }

      // Mettre à jour le statut de la commande
      const updatedOrder = await tx.order.update({
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
      });

      logger.info(`Commande ${orderId} validée manuellement avec succès`);

      // Traiter les alertes de commande en file d'attente
      await this.stockAlertService.markQueuedOrderAsProcessed(
        orderId,
        {
          processedBy: "CONTROLLER",
          validationType: "MANUAL",
        }
      );

      // Notifier les clients via WebSocket
      const wsController = getWebSocketController();
      if (wsController) {
        const orderNumber = orderId.substring(0, 8).toUpperCase();
        wsController.broadcastOrderStatus(orderId, orderNumber, "CONFIRMED");
      }

      // Retirer la commande de la file d'attente RabbitMQ
      try {
        const moved = await this.queueService.moveOrderFromQueueToStandard(orderId);
        if (moved) {
          logger.info(`Commande ${orderId} retirée de la file d'attente RabbitMQ avec succès`);
        } else {
          logger.warn(`Commande ${orderId} non trouvée dans la file d'attente RabbitMQ`);
        }
      } catch (error) {
        logger.error(`Erreur lors de la suppression de la commande ${orderId} de la file d'attente RabbitMQ:`, error);
        // Ne pas bloquer la validation de la commande si la suppression de la file d'attente échoue
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
   * Met à jour les stocks et crée des alertes pour une commande
   */
  private async updateStocksAndCreateAlerts(order: any): Promise<void> {
    try {
      logger.info(`Vérification des stocks pour la commande ${order.id}`);
      
      // Récupérer toutes les transactions existantes pour cette commande
      const existingTransactions = await this.prisma.stockTransaction.findMany({
        where: {
          reference: order.id,
          type: StockAdjustmentType.ORDER
        }
      });
      
      logger.info(`${existingTransactions.length} transactions de stock trouvées pour la commande ${order.id}`);
      
      for (const item of order.items) {
        // Ignorer les produits queuables
        if (item.product.is_queuable) {
          logger.info(`Produit ${item.product.id} ignoré car queuable`);
          continue;
        }
        
        // Vérifier si une transaction de stock existe déjà pour ce produit dans cette commande
        const existingTransaction = existingTransactions.find(
          t => t.productId === item.product.id
        );
        
        // Si une transaction existe déjà, ignorer ce produit
        if (existingTransaction) {
          logger.info(`Transaction de stock déjà existante pour le produit ${item.product.id} dans la commande ${order.id}, pas de mise à jour nécessaire`);
          continue;
        }
        
        logger.info(`Aucune transaction trouvée pour le produit ${item.product.id} dans la commande ${order.id}, mise à jour du stock nécessaire`);
        
        // Vérifier si le stock est suffisant
        if (item.product.stock < item.quantity) {
          logger.error(`Stock insuffisant pour le produit ${item.product.id} (commande: ${order.id})`);
          continue;
        }
        
        // Utiliser une transaction Prisma pour garantir l'atomicité
        await this.prisma.$transaction(async (tx) => {
          // Récupérer le produit avec son stock actuel pour avoir la valeur la plus à jour
          const currentProduct = await tx.product.findUnique({
            where: { id: item.product.id }
          });
          
          if (!currentProduct) {
            throw new Error(`Produit ${item.product.id} non trouvé`);
          }
          
          // Vérifier à nouveau si une transaction existe déjà (pour éviter les conditions de course)
          const txExists = await tx.stockTransaction.findFirst({
            where: {
              productId: item.product.id,
              reference: order.id,
              type: StockAdjustmentType.ORDER
            }
          });
          
          if (txExists) {
            logger.warn(`Transaction de stock créée entre-temps pour le produit ${item.product.id}, mise à jour ignorée`);
            return;
          }
          
          // Vérifier à nouveau si le stock est suffisant
          if (currentProduct.stock < item.quantity) {
            logger.error(`Stock insuffisant pour le produit ${item.product.id}: ${currentProduct.stock} < ${item.quantity}`);
            return;
          }
          
          // Mettre à jour le stock du produit
          const updatedProduct = await tx.product.update({
            where: { id: item.product.id },
            data: {
              stock: {
                decrement: item.quantity
              }
            }
          });
          
          // Enregistrer la transaction de stock directement via Prisma
          await tx.stockTransaction.create({
            data: {
              productId: item.product.id,
              quantity: -item.quantity, // Valeur négative car c'est une sortie de stock
              type: StockAdjustmentType.ORDER,
              reference: order.id,
              notes: `Commande confirmée #${order.id.substring(0, 8).toUpperCase()}`,
              previousStock: currentProduct.stock,
              newStock: currentProduct.stock - item.quantity
            }
          });
          
          logger.info(`Stock mis à jour pour le produit ${item.product.id}: ${currentProduct.stock} → ${updatedProduct.stock}`);
          
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
              message: `Stock bas (${updatedProduct.stock} restants) pour le produit ${updatedProduct.name} après la commande ${order.id.substring(0, 8).toUpperCase()}`,
              metadata: {
                message: `Stock bas (${updatedProduct.stock} restants) pour le produit ${updatedProduct.name} après la commande ${order.id.substring(0, 8).toUpperCase()}`,
                orderNumber: order.id.substring(0, 8).toUpperCase(),
                timestamp: new Date().toISOString()
              }
            });
            
            logger.warn(`Stock bas pour le produit ${updatedProduct.id}: ${updatedProduct.stock} restants`);
          }
        });
      }
    } catch (error) {
      logger.error(`Erreur lors de la mise à jour des stocks pour la commande ${order.id}:`, error);
      throw error;
    }
  }

  /**
   * Traite une commande en file d'attente
   */
  async processQueuedOrder(orderId: string): Promise<boolean> {
    try {
      logger.info(`Traitement de la commande en file d'attente ${orderId}`);
      
      // Déplacer la commande de la file queuable vers la file standard
      const moved = await this.queueService.moveOrderFromQueueToStandard(orderId);
      
      if (moved) {
        logger.info(`Commande ${orderId} déplacée vers la file standard pour traitement`);
        return true;
      } else {
        logger.warn(`Commande ${orderId} non trouvée dans la file d'attente`);
        return false;
      }
    } catch (error) {
      logger.error(`Erreur lors du traitement de la commande ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Valide manuellement une commande en file d'attente
   */
  async validateQueuedOrder(orderId: string): Promise<boolean> {
    try {
      // Vérifier si la commande existe
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true }
      });
      
      if (!order) {
        throw new Error(`Commande ${orderId} non trouvée`);
      }
      
      if (order.status !== 'PENDING') {
        throw new Error(`La commande ${orderId} n'est pas en attente (statut: ${order.status})`);
      }
      
      // Déplacer la commande de la file queuable vers la file standard
      const moved = await this.queueService.moveOrderFromQueueToStandard(orderId);
      
      if (!moved) {
        logger.warn(`Commande ${orderId} non trouvée dans la file d'attente`);
        // On continue quand même car la commande pourrait ne pas être dans la file
      }
      
      // Mettre à jour le statut de la commande
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: 'CONFIRMED' }
      });
      
      logger.info(`Commande ${orderId} validée manuellement`);
      return true;
    } catch (error) {
      logger.error(`Erreur lors de la validation manuelle de la commande ${orderId}:`, error);
      throw error;
    }
  }
}
