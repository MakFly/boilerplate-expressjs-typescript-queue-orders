"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateOrderSchema = exports.OrderItemSchema = void 0;
const zod_1 = require("zod");
// Schéma pour un produit dans la commande
exports.OrderItemSchema = zod_1.z.object({
    productId: zod_1.z.string(),
    quantity: zod_1.z.number().int().positive()
});
// Schéma pour la création d'une commande
exports.CreateOrderSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    items: zod_1.z.array(exports.OrderItemSchema),
    status: zod_1.z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED']).default('PENDING')
});
