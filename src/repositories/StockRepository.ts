import { PrismaClient, Product, StockAlert, StockAlertType } from '@prisma/client';

export class StockRepository {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = new PrismaClient();
    }

    async findProductWithStock(productId: string) {
        return this.prisma.product.findUnique({
            where: { id: productId },
            select: { id: true, stock: true, is_queuable: true }
        });
    }

    async updateStock(productId: string, quantity: number, options?: { transaction?: PrismaClient }) {
        const prisma = options?.transaction || this.prisma;
        return prisma.product.update({
            where: { id: productId },
            data: { stock: quantity }
        });
    }

    async createStockAlert(data: {
        type: StockAlertType;
        quantity: number;
        productId: string;
        orderId?: string;
        metadata?: any;
    }, options?: { transaction?: PrismaClient }) {
        const prisma = options?.transaction || this.prisma;
        return prisma.stockAlert.create({
            data: {
                type: data.type,
                quantity: data.quantity,
                product_id: data.productId,
                order_id: data.orderId,
                metadata: data.metadata
            }
        });
    }

    async getStockAlerts(productId: string) {
        return this.prisma.stockAlert.findMany({
            where: { product_id: productId },
            orderBy: { created_at: 'desc' }
        });
    }

    async verifyStockAvailability(items: Array<{ productId: string; quantity: number }>) {
        return this.prisma.$transaction(async (tx) => {
            const results = await Promise.all(
                items.map(async (item) => {
                    const product = await tx.product.findFirst({
                        where: { id: item.productId },
                        select: { id: true, stock: true },
                        orderBy: { id: 'asc' }
                    });

                    if (!product) {
                        return {
                            productId: item.productId,
                            isAvailable: false,
                            message: 'Produit non trouvé'
                        };
                    }

                    return {
                        productId: item.productId,
                        isAvailable: product.stock >= item.quantity,
                        currentStock: product.stock,
                        requestedQuantity: item.quantity
                    };
                })
            );

            return results;
        }, {
            isolationLevel: 'Serializable'
        });
    }
} 