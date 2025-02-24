import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

export class StockService {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = new PrismaClient();
    }

    async checkAndReserveStock(orderId: string, items: Array<{ productId: string; quantity: number }>, userId?: string) {
        return this.prisma.$transaction(async (tx) => {
            const results = [];
            logger.info('Début de la vérification des stocks pour la commande:', orderId);

            // Vérifier d'abord tous les stocks avant de faire des modifications
            for (const item of items) {
                logger.info(`Vérification du produit ${item.productId}, quantité demandée: ${item.quantity}`);
                
                const product = await tx.product.findUnique({
                    where: { id: item.productId },
                    select: { id: true, stock: true, is_queuable: true }
                });
                logger.info('Produit trouvé:', product);

                if (!product) {
                    logger.error(`Produit ${item.productId} non trouvé`);
                    throw new Error(`Produit ${item.productId} non trouvé`);
                }

                // Vérifier si une commande existe déjà pour ce produit
                const existingOrder = await tx.order.findFirst({
                    where: {
                        items: {
                            some: {
                                productId: item.productId
                            }
                        },
                        userId: userId,
                        status: {
                            in: ['CONFIRMED', 'PROCESSING']
                        }
                    },
                    include: {
                        items: true
                    }
                });
                logger.info('Commande existante trouvée:', existingOrder);

                if (existingOrder) {
                    const existingItem = existingOrder.items.find(i => i.productId === item.productId);
                    if (existingItem) {
                        if (product.is_queuable) {
                            logger.info(`Produit queuable ${item.productId} - Commande autorisée malgré une commande existante`);
                        } else if (product.stock < (item.quantity + existingItem.quantity)) {
                            logger.error(`Stock insuffisant en tenant compte des commandes en cours. Stock: ${product.stock}, Demandé: ${item.quantity}, Existant: ${existingItem.quantity}`);
                            throw new Error(`Stock insuffisant pour le produit ${item.productId} en tenant compte des commandes en cours`);
                        }
                    }
                }

                if (!product.is_queuable && product.stock < item.quantity) {
                    logger.error(`Stock insuffisant. Stock: ${product.stock}, Demandé: ${item.quantity}`);
                    throw new Error(`Stock insuffisant pour le produit ${item.productId}`);
                }
            }

            // Si tous les stocks sont OK, procéder aux mises à jour
            for (const item of items) {
                const product = await tx.product.findUnique({
                    where: { id: item.productId },
                    select: { id: true, stock: true, is_queuable: true }
                });

                if (!product) continue; // Déjà vérifié plus haut

                const isAvailable = product.stock >= item.quantity;
                const newStock = product.stock - item.quantity;

                if (isAvailable) {
                    if (product.is_queuable) {
                        // Pour les produits queuables, ne pas décrémenter le stock mais créer une alerte
                        const existingQueuedQuantity = await tx.stockAlert.aggregate({
                            where: {
                                product_id: product.id,
                                type: 'QUEUED_ORDER',
                                order_id: null
                            },
                            _sum: {
                                quantity: true
                            }
                        });

                        const totalQueuedQuantity = (existingQueuedQuantity._sum.quantity || 0) + item.quantity;

                        // Créer une alerte pour stock insuffisant mais queuable
                        await tx.stockAlert.create({
                            data: {
                                type: 'QUEUED_ORDER',
                                quantity: item.quantity,
                                product_id: product.id,
                                order_id: orderId === 'temporary' ? null : orderId,
                                metadata: {
                                    currentStock: product.stock,
                                    requestedQuantity: item.quantity,
                                    totalQueuedQuantity: totalQueuedQuantity,
                                    queuePosition: Math.ceil(totalQueuedQuantity / product.stock),
                                    temporaryOrderId: orderId === 'temporary' ? orderId : null
                                }
                            }
                        });

                        results.push({
                            productId: product.id,
                            success: true,
                            currentStock: product.stock,
                            newStock: product.stock,
                            isQueued: true,
                            queuedQuantity: totalQueuedQuantity
                        });
                    } else {
                        // Pour les produits non-queuables, mettre à jour le stock
                        await tx.product.update({
                            where: { id: product.id },
                            data: { stock: newStock }
                        });

                        // Créer une alerte si le stock devient bas
                        if (newStock <= Math.max(5, item.quantity * 0.1)) {
                            await tx.stockAlert.create({
                                data: {
                                    type: newStock === 0 ? 'STOCK_OUT' : 'LOW_STOCK',
                                    quantity: newStock,
                                    product_id: product.id,
                                    order_id: orderId === 'temporary' ? null : orderId,
                                    metadata: {
                                        threshold: Math.max(5, item.quantity * 0.1),
                                        previousStock: product.stock,
                                        currentStock: newStock,
                                        temporaryOrderId: orderId === 'temporary' ? orderId : null
                                    }
                                }
                            });
                        }

                        results.push({
                            productId: product.id,
                            success: true,
                            currentStock: product.stock,
                            newStock: newStock,
                            isQueued: false
                        });
                    }
                } else if (product.is_queuable) {
                    // Pour les produits queuables, ne pas décrémenter le stock mais créer une alerte
                    const existingQueuedQuantity = await tx.stockAlert.aggregate({
                        where: {
                            product_id: product.id,
                            type: 'QUEUED_ORDER',
                            order_id: null
                        },
                        _sum: {
                            quantity: true
                        }
                    });

                    const totalQueuedQuantity = (existingQueuedQuantity._sum.quantity || 0) + item.quantity;

                    // Créer une alerte pour stock insuffisant mais queuable
                    await tx.stockAlert.create({
                        data: {
                            type: 'QUEUED_ORDER',
                            quantity: item.quantity,
                            product_id: product.id,
                            order_id: orderId === 'temporary' ? null : orderId,
                            metadata: {
                                currentStock: product.stock,
                                requestedQuantity: item.quantity,
                                totalQueuedQuantity: totalQueuedQuantity,
                                queuePosition: Math.ceil(totalQueuedQuantity / product.stock),
                                temporaryOrderId: orderId === 'temporary' ? orderId : null
                            }
                        }
                    });

                    results.push({
                        productId: product.id,
                        success: true,
                        currentStock: product.stock,
                        newStock: product.stock,
                        isQueued: true,
                        queuedQuantity: totalQueuedQuantity
                    });
                }
            }

            return results;
        }, {
            isolationLevel: 'Serializable'
        });
    }

    async releaseStock(orderId: string, items: Array<{ productId: string; quantity: number }>) {
        return this.prisma.$transaction(async (tx) => {
            for (const item of items) {
                const product = await tx.product.findUnique({
                    where: { id: item.productId }
                });

                if (!product) continue;

                await tx.product.update({
                    where: { id: item.productId },
                    data: { stock: { increment: item.quantity } }
                });

                // Mettre à jour ou supprimer les alertes si nécessaire
                if (product.stock + item.quantity > 5) {
                    await tx.stockAlert.deleteMany({
                        where: {
                            product_id: item.productId,
                            type: {
                                in: ['LOW_STOCK', 'STOCK_OUT']
                            }
                        }
                    });
                }
            }
        });
    }
} 