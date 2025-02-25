"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderService = void 0;
const client_1 = require("@prisma/client");
const QueueService_1 = require("./QueueService");
const StockAlertService_1 = require("./StockAlertService");
const PrismaService_1 = require("./PrismaService");
const ApiError_1 = require("../utils/ApiError");
const logger_1 = __importDefault(require("../utils/logger"));
class OrderService {
    constructor() {
        this.prismaService = new PrismaService_1.PrismaService();
        this.prisma = this.prismaService.client;
        this.queueService = QueueService_1.QueueService.getInstance();
        this.stockAlertService = new StockAlertService_1.StockAlertService(this.prismaService, this.queueService);
    }
    // Méthode publique pour accéder au service de file d'attente
    getQueueService() {
        return this.queueService;
    }
    /**
     * Récupère toutes les commandes
     */
    async getAllOrders() {
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
            }));
        }
        catch (error) {
            logger_1.default.error("Erreur lors de la récupération des commandes:", error);
            throw new ApiError_1.ApiError(500, "Impossible de récupérer les commandes");
        }
    }
    /**
     * Récupère une commande par son ID
     */
    async getOrderById(id) {
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
                throw new ApiError_1.ApiError(404, "Commande non trouvée");
            }
            return order;
        }
        catch (error) {
            if (error instanceof ApiError_1.ApiError)
                throw error;
            logger_1.default.error(`Erreur lors de la récupération de la commande ${id}:`, error);
            throw new ApiError_1.ApiError(500, "Impossible de récupérer la commande");
        }
    }
    /**
     * Crée une nouvelle commande avec gestion de la file d'attente
     */
    async createOrder(orderData) {
        try {
            // Validation des produits
            if (!orderData.items || orderData.items.length === 0) {
                throw new ApiError_1.ApiError(400, "La commande doit contenir au moins un produit");
            }
            // Vérifier si un des produits nécessite une mise en file d'attente
            const productIds = orderData.items.map((item) => item.productId);
            logger_1.default.info("Recherche des produits avec les IDs:", productIds);
            // Vérifier si l'utilisateur existe
            const user = await this.prisma.user.findUnique({
                where: { id: orderData.userId }
            });
            if (!user) {
                throw new ApiError_1.ApiError(400, "Utilisateur non trouvé");
            }
            const products = await this.prisma.product.findMany({
                where: { id: { in: productIds } },
            });
            logger_1.default.info("Produits trouvés:", products);
            // Vérifier que tous les produits existent
            if (products.length !== productIds.length) {
                const missingProducts = productIds.filter((id) => !products.find((p) => p.id === id));
                logger_1.default.error("Produits manquants:", missingProducts);
                throw new ApiError_1.ApiError(400, `Produits non trouvés: ${missingProducts.join(", ")}`);
            }
            // Calculer le montant total
            const totalAmount = orderData.items.reduce((total, item) => {
                const product = products.find((p) => p.id === item.productId);
                if (!product)
                    return total; // Ne devrait jamais arriver grâce à la vérification plus haut
                return total + item.quantity * product.price;
            }, 0);
            // Vérifier si des produits sont queuables
            const hasQueuableProducts = products.some((product) => product.is_queuable);
            // Créer la commande
            const order = (await this.prisma.order.create({
                data: {
                    userId: orderData.userId,
                    status: hasQueuableProducts ? "PENDING" : "CONFIRMED",
                    totalAmount,
                    items: {
                        create: orderData.items.map((item) => {
                            const product = products.find((p) => p.id === item.productId);
                            if (!product) {
                                throw new ApiError_1.ApiError(400, `Produit non trouvé: ${item.productId}`);
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
            }));
            // Vérifier le stock et créer les alertes nécessaires
            for (const item of order.items) {
                const product = products.find((p) => p.id === item.productId);
                if (!product)
                    continue;
                // Pour les produits non-queuables, vérifier si le stock est bas
                if (!product.is_queuable) {
                    await this.stockAlertService.checkLowStockAlert(item.productId, product.stock, item.quantity, { orderId: order.id });
                }
            }
            // Envoyer systématiquement la commande à RabbitMQ pour vérification et tracking
            await this.queueService.addToQueue({
                type: "STOCK_VERIFICATION",
                data: {
                    orderId: order.id,
                    hasQueuableProducts,
                    items: order.items.map((item) => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        isQueuable: products.find((p) => p.id === item.productId)?.is_queuable ||
                            false,
                    })),
                },
            });
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
        }
        catch (error) {
            if (error instanceof ApiError_1.ApiError)
                throw error;
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
                logger_1.default.error("Erreur de base de données:", error);
                if (error.code === "P2002") {
                    throw new ApiError_1.ApiError(400, "Une commande similaire existe déjà");
                }
                if (error.code === "P2003") {
                    throw new ApiError_1.ApiError(400, "Un ou plusieurs produits n'existent pas");
                }
            }
            logger_1.default.error("Erreur lors de la création de la commande:", error);
            throw new ApiError_1.ApiError(500, "Impossible de créer la commande");
        }
    }
    /**
     * Met à jour le statut d'une commande
     */
    async updateOrderStatus(id, status) {
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
                logger_1.default.error(`Erreur lors de la mise à jour du statut de la commande ${id}: Commande non trouvée`);
                throw new ApiError_1.ApiError(404, "Commande non trouvée");
            }
            return order;
        }
        catch (error) {
            if (error instanceof ApiError_1.ApiError)
                throw error;
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
                if (error.code === "P2025") {
                    throw new ApiError_1.ApiError(404, "Commande non trouvée");
                }
            }
            logger_1.default.error(`Erreur lors de la mise à jour du statut de la commande ${id}:`, error);
            throw new ApiError_1.ApiError(500, "Impossible de mettre à jour le statut de la commande");
        }
    }
    /**
     * Supprime une commande
     */
    async deleteOrder(id) {
        try {
            await this.prisma.order.delete({
                where: { id },
            });
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
                if (error.code === "P2025") {
                    throw new ApiError_1.ApiError(404, "Commande non trouvée");
                }
            }
            logger_1.default.error(`Erreur lors de la suppression de la commande ${id}: Commande non trouvée`, error);
            throw new ApiError_1.ApiError(500, "Impossible de supprimer la commande");
        }
    }
    async confirmOrder(orderId) {
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
                if (!product)
                    continue;
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
                    throw new Error(`Stock insuffisant pour le produit ${item.productId}`);
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
    async validateOrderManually(orderId) {
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
                throw new ApiError_1.ApiError(404, "Commande non trouvée");
            }
            if (order.status !== "PENDING") {
                throw new ApiError_1.ApiError(400, `La commande ne peut pas être validée car elle est ${order.status}`);
            }
            // Vérifier que la commande contient au moins un produit queuable
            const hasQueuableProducts = order.items.some((item) => item.product.is_queuable);
            if (!hasQueuableProducts) {
                throw new ApiError_1.ApiError(400, "Cette commande ne contient pas de produits queuables et ne peut pas être validée manuellement");
            }
            // Vérifier les stocks pour TOUS les produits, qu'ils soient queuables ou non
            for (const item of order.items) {
                const product = item.product;
                // Vérifier le stock pour tous les produits
                if (product.stock < item.quantity) {
                    throw new ApiError_1.ApiError(400, `Stock insuffisant pour le produit ${product.name} (stock actuel: ${product.stock}, quantité demandée: ${item.quantity})`);
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
                await this.stockAlertService.checkLowStockAlert(product.id, newStock, item.quantity, { orderId });
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
            }));
            // Marquer les alertes de commande en file d'attente comme traitées
            await this.stockAlertService.markQueuedOrderAsProcessed(orderId, {
                processedBy: "CONTROLLER",
                validationType: "MANUAL",
            });
            // Déplacer la commande de la file d'attente queuable vers la file standard
            // pour qu'elle soit traitée par le worker standard
            try {
                logger_1.default.info(`Validation manuelle de la commande ${orderId}`);
                const moved = await this.queueService.moveToStandardQueue(orderId);
                if (moved) {
                    logger_1.default.info(`✅ Commande ${orderId} déplacée vers la file standard`);
                }
                else {
                    logger_1.default.warn(`Commande ${orderId} non trouvée dans la file queuable`);
                    // Vérifier si la commande a déjà été traitée
                    const existsInStandard = await this.queueService.checkOrderInStandardQueue(orderId);
                    if (existsInStandard) {
                        logger_1.default.info(`La commande ${orderId} est déjà dans la file standard, elle a probablement déjà été déplacée`);
                    }
                    else {
                        logger_1.default.warn(`La commande ${orderId} n'est ni dans la file queuable ni dans la file standard. Elle a peut-être déjà été traitée par un worker.`);
                    }
                }
            }
            catch (error) {
                logger_1.default.error(`Erreur lors du déplacement de la commande ${orderId}:`, error);
                // On ne bloque pas la validation si le déplacement échoue
            }
            return {
                status: "CONFIRMED",
                message: "Commande validée manuellement avec succès",
                order: updatedOrder,
            };
        });
    }
}
exports.OrderService = OrderService;
