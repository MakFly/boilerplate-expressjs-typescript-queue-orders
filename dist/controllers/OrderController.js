"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderController = void 0;
const OrderService_1 = require("../services/OrderService");
const ApiError_1 = require("../utils/ApiError");
const logger_1 = __importDefault(require("../utils/logger"));
class OrderController {
    constructor() {
        this.orderService = new OrderService_1.OrderService();
    }
    /**
     * Récupère toutes les commandes
     */
    async getAllOrders(req, res, next) {
        try {
            logger_1.default.info('Récupération de toutes les commandes');
            const orders = await this.orderService.getAllOrders();
            res.json({ success: true, data: orders });
        }
        catch (error) {
            next(ApiError_1.ApiError.internal('Erreur lors de la récupération des commandes', error));
        }
    }
    /**
     * Récupère une commande par son ID
     */
    async getOrderById(req, res, next) {
        try {
            const id = req.params.id;
            if (!id) {
                throw ApiError_1.ApiError.badRequest('ID de commande invalide');
            }
            logger_1.default.info(`Récupération de la commande ${id}`);
            const order = await this.orderService.getOrderById(id.toString());
            if (!order) {
                throw ApiError_1.ApiError.notFound('Commande non trouvée');
            }
            res.json({ success: true, data: order });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * Crée une nouvelle commande
     */
    async createOrder(req, res, next) {
        try {
            const orderData = req.body;
            logger_1.default.info('Création d\'une nouvelle commande', { orderData });
            const newOrder = await this.orderService.createOrder(orderData);
            // Formatage de la réponse pour ne garder que l'essentiel
            const response = {
                success: true,
                message: 'Commande créée avec succès',
                data: {
                    orderId: newOrder.order.id,
                    status: newOrder.status,
                    totalAmount: newOrder.order.totalAmount,
                    items: newOrder.order.items.map(item => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        price: item.price
                    }))
                }
            };
            res.status(201).json(response);
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * Met à jour le statut d'une commande
     */
    async updateOrderStatus(req, res, next) {
        try {
            const id = req.params.id;
            if (!id) {
                throw ApiError_1.ApiError.badRequest('ID de commande invalide');
            }
            const { status } = req.body;
            logger_1.default.info(`Mise à jour du statut de la commande ${id}`, { status });
            const updatedOrder = await this.orderService.updateOrderStatus(id, status);
            res.json({
                success: true,
                message: 'Statut de la commande mis à jour',
                data: updatedOrder
            });
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * Supprime une commande
     */
    async deleteOrder(req, res, next) {
        try {
            const id = req.params.id;
            if (!id) {
                throw ApiError_1.ApiError.badRequest('ID de commande invalide');
            }
            logger_1.default.info(`Suppression de la commande ${id}`);
            await this.orderService.deleteOrder(id);
            res.status(204).send();
        }
        catch (error) {
            next(error);
        }
    }
    /**
     * Valide manuellement une commande
     */
    async validateOrder(req, res, next) {
        try {
            const id = req.params.id;
            if (!id) {
                throw ApiError_1.ApiError.badRequest('ID de commande invalide');
            }
            logger_1.default.info(`Validation manuelle de la commande ${id}`);
            const validatedOrder = await this.orderService.validateOrderManually(id);
            res.json({
                success: true,
                message: 'Commande validée avec succès',
                data: validatedOrder
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.OrderController = OrderController;
