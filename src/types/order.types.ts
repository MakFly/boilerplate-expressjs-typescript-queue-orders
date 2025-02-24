import { Order, OrderItem, Product } from '@prisma/client';

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';

export interface OrderWithItems extends Order {
    items: (OrderItem & {
        product: Product;
    })[];
}

export interface QueueMessageData {
    orderId: string;
    hasQueuableProducts: boolean;
    items: {
        productId: string;
        quantity: number;
        isQueuable: boolean;
    }[];
}

export interface QueueMessage {
    type: 'STOCK_VERIFICATION';
    data: QueueMessageData;
}

export interface OrderResponse {
    status: OrderStatus;
    message: string;
    order: OrderWithItems;
}

export interface StockVerificationResult {
    productId: string;
    isAvailable: boolean;
    currentStock?: number;
    requestedQuantity?: number;
    message?: string;
} 