import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../services/PrismaService';

export class StockRepository {
    constructor(private prisma: PrismaService) {}

    async findProductWithStock(productId: string) {
        return this.prisma.client.product.findUnique({
            where: { id: productId },
            select: { id: true, stock: true, is_queuable: true, name: true }
        });
    }

    async updateStock(productId: string, quantity: number, options?: { transaction?: PrismaClient }) {
        const prisma = options?.transaction || this.prisma.client;
        const product = await prisma.product.update({
            where: { id: productId },
            data: { stock: quantity },
            select: { stock: true }
        });
        return product.stock;
    }

    async getStockAlerts(productId: string) {
        return this.prisma.client.stockAlert.findMany({
            where: { product_id: productId },
            orderBy: { created_at: 'desc' }
        });
    }

    async verifyStockAvailability(items: Array<{ productId: string; quantity: number }>) {
        return this.prisma.client.$transaction(async (tx) => {
            const results = await Promise.all(
                items.map(async (item) => {
                    const product = await tx.product.findFirst({
                        where: { id: item.productId },
                        select: { id: true, stock: true, name: true },
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
                        requestedQuantity: item.quantity,
                        productName: product.name
                    };
                })
            );

            return results;
        }, {
            isolationLevel: 'Serializable'
        });
    }

    async getStockLevel(productId: string): Promise<number> {
        const product = await this.prisma.client.product.findUnique({
            where: { id: productId },
            select: { stock: true }
        });
        return product?.stock ?? 0;
    }
}