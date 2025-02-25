"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StockRepository = void 0;
class StockRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findProductWithStock(productId) {
        return this.prisma.client.product.findUnique({
            where: { id: productId },
            select: { id: true, stock: true, is_queuable: true, name: true }
        });
    }
    async updateStock(productId, quantity, options) {
        const prisma = options?.transaction || this.prisma.client;
        const product = await prisma.product.update({
            where: { id: productId },
            data: { stock: quantity },
            select: { stock: true }
        });
        return product.stock;
    }
    async getStockAlerts(productId) {
        return this.prisma.client.stockAlert.findMany({
            where: { product_id: productId },
            orderBy: { created_at: 'desc' }
        });
    }
    async verifyStockAvailability(items) {
        return this.prisma.client.$transaction(async (tx) => {
            const results = await Promise.all(items.map(async (item) => {
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
            }));
            return results;
        }, {
            isolationLevel: 'Serializable'
        });
    }
    async getStockLevel(productId) {
        const product = await this.prisma.client.product.findUnique({
            where: { id: productId },
            select: { stock: true }
        });
        return product?.stock ?? 0;
    }
}
exports.StockRepository = StockRepository;
