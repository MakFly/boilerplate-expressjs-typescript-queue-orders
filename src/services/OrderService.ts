import { PrismaClient, Prisma, StockAlertType } from '@prisma/client';
import { CreateOrderDto } from '../dtos/order.dto';
import { QueueService } from './QueueService';
import { ApiError } from '../utils/ApiError';
import logger from '../utils/logger';
import { OrderStatus, OrderWithItems, OrderResponse } from '../types/order.types';

export class OrderService {
    private prisma: PrismaClient;
    private queueService: QueueService;

    constructor() {
        this.prisma = new PrismaClient();
        this.queueService = QueueService.getInstance();
    }

    // Méthode publique pour accéder au service de file d'attente
    public getQueueService(): QueueService {
        return this.queueService;
    }

    /**
     * Récupère toutes les commandes
     */
    async getAllOrders(): Promise<OrderWithItems[]> {
        try {
            return await this.prisma.order.findMany({
                include: {
                    user: true,
                    items: {
                        include: {
                            product: true
                        }
                    }
                }
            }) as OrderWithItems[];
        } catch (error) {
            logger.error('Erreur lors de la récupération des commandes:', error);
            throw new ApiError(500, 'Impossible de récupérer les commandes');
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
                            product: true
                        }
                    }
                }
            });

            if (!order) {
                throw new ApiError(404, 'Commande non trouvée');
            }

            return order as OrderWithItems;
        } catch (error) {
            if (error instanceof ApiError) throw error;
            
            logger.error(`Erreur lors de la récupération de la commande ${id}:`, error);
            throw new ApiError(500, 'Impossible de récupérer la commande');
        }
    }


    /**
     * Crée une nouvelle commande avec gestion de la file d'attente
     */
    async createOrder(orderData: CreateOrderDto): Promise<OrderResponse> {
        try {
            // Validation des produits
            if (!orderData.items || orderData.items.length === 0) {
                throw new ApiError(400, 'La commande doit contenir au moins un produit');
            }

            // Vérifier si un des produits nécessite une mise en file d'attente
            const productIds = orderData.items.map(item => item.productId);
            logger.info('Recherche des produits avec les IDs:', productIds);
            
            const products = await this.prisma.product.findMany({
                where: { id: { in: productIds } }
            });
            logger.info('Produits trouvés:', products);

            // Vérifier que tous les produits existent
            if (products.length !== productIds.length) {
                const missingProducts = productIds.filter(id => !products.find(p => p.id === id));
                logger.error('Produits manquants:', missingProducts);
                throw new ApiError(400, `Produits non trouvés: ${missingProducts.join(', ')}`);
            }

            // Calculer le montant total
            const totalAmount = orderData.items.reduce((total, item) => {
                const product = products.find(p => p.id === item.productId);
                if (!product) return total; // Ne devrait jamais arriver grâce à la vérification plus haut
                return total + (item.quantity * product.price);
            }, 0);

            // Vérifier si des produits sont queuables
            const hasQueuableProducts = products.some(product => product.is_queuable);

            // Créer la commande
            const order = await this.prisma.order.create({
                data: {
                    userId: orderData.userId,
                    status: hasQueuableProducts ? 'PENDING' : 'CONFIRMED',
                    totalAmount,
                    items: {
                        create: orderData.items.map(item => {
                            const product = products.find(p => p.id === item.productId);
                            if (!product) {
                                throw new ApiError(400, `Produit non trouvé: ${item.productId}`);
                            }
                            return {
                                productId: item.productId,
                                quantity: item.quantity,
                                price: product.price
                            };
                        })
                    }
                },
                include: {
                    items: {
                        include: {
                            product: true
                        }
                    }
                }
            }) as OrderWithItems;

            // Créer les alertes de stock pour les produits queuables
            for (const item of order.items) {
                const product = products.find(p => p.id === item.productId);
                if (product?.is_queuable) {
                    await this.prisma.stockAlert.create({
                        data: {
                            type: 'QUEUED_ORDER',
                            quantity: item.quantity,
                            product_id: item.productId,
                            order_id: order.id,
                            metadata: {
                                currentStock: product.stock,
                                requestedQuantity: item.quantity,
                                queuePosition: 1, // Sera mis à jour par le worker
                                timestamp: new Date().toISOString()
                            }
                        }
                    });
                }
            }

            // Envoyer systématiquement la commande à RabbitMQ pour vérification et tracking
            await this.queueService.addToQueue({
                type: 'STOCK_VERIFICATION',
                data: {
                    orderId: order.id,
                    hasQueuableProducts,
                    items: order.items.map(item => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        isQueuable: products.find(p => p.id === item.productId)?.is_queuable || false
                    }))
                }
            });

            if (hasQueuableProducts) {
                return {
                    status: 'PENDING',
                    message: hasQueuableProducts 
                        ? 'Commande en attente de validation manuelle'
                        : 'Commande en cours de traitement',
                    order
                };
            }

            return {
                status: 'CONFIRMED',
                message: 'Commande confirmée',
                order
            };
        } catch (error) {
            if (error instanceof ApiError) throw error;
            
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                logger.error('Erreur de base de données:', error);
                if (error.code === 'P2002') {
                    throw new ApiError(400, 'Une commande similaire existe déjà');
                }
                if (error.code === 'P2003') {
                    throw new ApiError(400, 'Un ou plusieurs produits n\'existent pas');
                }
            }

            logger.error('Erreur lors de la création de la commande:', error);
            throw new ApiError(500, 'Impossible de créer la commande');
        }
    }

    /**
     * Met à jour le statut d'une commande
     */
    async updateOrderStatus(id: string, status: OrderStatus): Promise<OrderWithItems> {
        try {
            const order = await this.prisma.order.update({
                where: { id },
                data: { status },
                include: {
                    items: {
                        include: {
                            product: true
                        }
                    }
                }
            });

            if (!order) {
                throw new ApiError(404, 'Commande non trouvée');
            }

            return order as OrderWithItems;
        } catch (error) {
            if (error instanceof ApiError) throw error;
            
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2025') {
                    throw new ApiError(404, 'Commande non trouvée');
                }
            }

            logger.error(`Erreur lors de la mise à jour du statut de la commande ${id}:`, error);
            throw new ApiError(500, 'Impossible de mettre à jour le statut de la commande');
        }
    }

    /**
     * Supprime une commande
     */
    async deleteOrder(id: string) {
        try {
            await this.prisma.order.delete({
                where: { id }
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2025') {
                    throw new ApiError(404, 'Commande non trouvée');
                }
            }

            logger.error(`Erreur lors de la suppression de la commande ${id}:`, error);
            throw new ApiError(500, 'Impossible de supprimer la commande');
        }
    }

    async confirmOrder(orderId: string) {
        return this.prisma.$transaction(async (tx) => {
            const order = await tx.order.findUnique({
                where: { id: orderId },
                include: { items: true }
            });

            if (!order) {
                throw new Error('Commande non trouvée');
            }

            if (order.status !== 'PENDING') {
                throw new Error(`La commande est ${order.status}`);
            }

            // Vérifier une dernière fois les stocks
            for (const item of order.items) {
                const product = await tx.product.findUnique({
                    where: { id: item.productId },
                    select: { id: true, stock: true, is_queuable: true }
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
                            status: 'CANCELLED',
                            cancellationReason: 'Stock insuffisant'
                        }
                    });
                    throw new Error(`Stock insuffisant pour le produit ${item.productId}`);
                }
            }

            return tx.order.update({
                where: { id: orderId },
                data: { status: 'CONFIRMED' }
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
                            product: true
                        }
                    }
                }
            });

            if (!order) {
                throw new ApiError(404, 'Commande non trouvée');
            }

            if (order.status !== 'PENDING') {
                throw new ApiError(400, `La commande ne peut pas être validée car elle est ${order.status}`);
            }

            // Vérifier que la commande contient au moins un produit queuable
            const hasQueuableProducts = order.items.some(item => item.product.is_queuable);
            if (!hasQueuableProducts) {
                throw new ApiError(400, 'Cette commande ne contient pas de produits queuables et ne peut pas être validée manuellement');
            }

            // Vérifier les stocks pour tous les produits
            for (const item of order.items) {
                const product = item.product;
                
                // Pour les produits non-queuables, on vérifie juste le stock
                if (!product.is_queuable && product.stock < item.quantity) {
                    throw new ApiError(400, `Stock insuffisant pour le produit ${product.name}`);
                }

                // Pour les produits queuables, on vérifie la position dans la file
                if (product.is_queuable) {
                    const queuePosition = await tx.stockAlert.count({
                        where: {
                            product_id: product.id,
                            type: 'QUEUED_ORDER',
                            order_id: {
                                not: orderId
                            }
                        }
                    });

                    // Mettre à jour les métadonnées de l'alerte
                    await tx.stockAlert.updateMany({
                        where: {
                            order_id: orderId,
                            product_id: product.id,
                            type: 'QUEUED_ORDER'
                        },
                        data: {
                            metadata: {
                                queuePosition: queuePosition + 1,
                                validationTimestamp: new Date().toISOString()
                            }
                        }
                    });
                }

                // Mettre à jour le stock
                await tx.product.update({
                    where: { id: product.id },
                    data: {
                        stock: {
                            decrement: item.quantity
                        }
                    }
                });

                // Créer une alerte si le stock devient bas
                if (product.stock - item.quantity <= Math.max(5, item.quantity * 0.1)) {
                    await tx.stockAlert.create({
                        data: {
                            type: product.stock - item.quantity === 0 ? 'STOCK_OUT' : 'LOW_STOCK',
                            quantity: product.stock - item.quantity,
                            product_id: product.id,
                            order_id: orderId,
                            metadata: {
                                threshold: Math.max(5, item.quantity * 0.1),
                                previousStock: product.stock,
                                currentStock: product.stock - item.quantity
                            }
                        }
                    });
                }
            }

            // Confirmer la commande
            const updatedOrder = await tx.order.update({
                where: { id: orderId },
                data: {
                    status: 'CONFIRMED'
                },
                include: {
                    items: {
                        include: {
                            product: true
                        }
                    }
                }
            }) as OrderWithItems;

            // Mettre à jour les alertes de stock avec les informations de validation
            await tx.stockAlert.updateMany({
                where: {
                    order_id: orderId,
                    type: 'QUEUED_ORDER'
                },
                data: {
                    type: 'PROCESSED',
                    metadata: {
                        processedAt: new Date().toISOString(),
                        processedBy: 'CONTROLLER',
                        validatedAt: new Date().toISOString(),
                        validationType: 'MANUAL'
                    }
                }
            });

            return {
                status: 'CONFIRMED',
                message: 'Commande validée manuellement avec succès',
                order: updatedOrder
            };
        });
    }
} 