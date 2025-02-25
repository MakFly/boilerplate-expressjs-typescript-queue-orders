import { z } from 'zod';

// Schéma pour un produit dans la commande
export const OrderItemSchema = z.object({
    productId: z.string(),
    quantity: z.number().int().positive()
});

// Schéma pour la création d'une commande
export const CreateOrderSchema = z.object({
    userId: z.string(),
    items: z.array(OrderItemSchema),
    status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED']).default('PENDING')
});

// Types dérivés des schémas
export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;

// Type pour la réponse de commande
export type OrderResponseDto = {
    id: string;
    userId: string;
    items: OrderItemDto[];
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
    totalAmount: number;
    createdAt: Date;
    updatedAt: Date;
};

export interface OrderItemDto {
    productId: string;
    quantity: number;
    price: number;
    name: string;
}
