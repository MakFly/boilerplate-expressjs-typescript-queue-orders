import { Request, Response, NextFunction } from 'express';
import { OrderService } from '../services/OrderService';
import { StockService } from '../services/stocks/StockService';
import { StockRepository } from '../repositories/StockRepository';
import { PrismaService } from '../services/PrismaService';
import { CreateOrderDto } from '../dto/order.dto';
import { ApiError } from '../utils/ApiError';
import logger from '../utils/logger';
import { getWebSocketController } from './websocket.controller';

export class OrderController {
    private orderService: OrderService;
    private stockService: StockService;
    private prismaService: PrismaService;

    constructor() {
        this.prismaService = new PrismaService();
        const stockRepository = new StockRepository(this.prismaService);
        this.stockService = new StockService(stockRepository, this.prismaService);
        this.orderService = new OrderService();
    }

    /**
     * Récupère toutes les commandes
     */
    async getAllOrders(req: Request, res: Response, next: NextFunction) {
        try {
            logger.info('Récupération de toutes les commandes');
            const orders = await this.orderService.getAllOrders();
            res.json({ success: true, data: orders });
        } catch (error) {
            next(ApiError.internal('Erreur lors de la récupération des commandes', error));
        }
    }

    /**
     * Récupère une commande par son ID
     */
    async getOrderById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = req.params.id;
            if (!id) {
                throw ApiError.badRequest('ID de commande invalide');
            }

            logger.info(`Récupération de la commande ${id}`);
            const order = await this.orderService.getOrderById(id.toString());
            
            if (!order) {
                throw ApiError.notFound('Commande non trouvée');
            }
            
            res.json({ success: true, data: order });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Crée une nouvelle commande
     */
    async createOrder(req: Request, res: Response, next: NextFunction) {
        try {
            // Récupérer l'ID de l'utilisateur à partir du token JWT
            if (!req.user || !req.user.id) {
                return res.status(401).json({
                    success: false,
                    message: 'Utilisateur non authentifié',
                    details: {
                        body: req.body
                    }
                });
            }

            // Créer une copie de req.body et ajouter l'ID de l'utilisateur
            const orderData: CreateOrderDto = {
                ...req.body,
                userId: req.user.id // Ajouter l'ID de l'utilisateur à partir du token JWT
            };

            logger.info('Création d\'une nouvelle commande', { orderData });

            // Validation des données d'entrée
            if (!orderData.items || orderData.items.length === 0) {
                logger.error('Données de commande invalides', { body: req.body });
                return res.status(400).json({
                    success: false,
                    message: 'Données de commande invalides',
                    details: {
                        body: req.body,
                        missingFields: ['items']
                    }
                });
            }

            const newOrder = await this.orderService.createOrder(orderData);
            
            // Diffuser la notification de nouvelle commande via WebSocket
            const wsController = getWebSocketController();
            if (wsController) {
                wsController.broadcastToAllClients('order:new', {
                    orderId: newOrder.order.id,
                    orderNumber: newOrder.order.id.substring(0, 8).toUpperCase(),
                    status: newOrder.order.status,
                    totalAmount: newOrder.order.totalAmount,
                    createdAt: newOrder.order.createdAt
                });
            }
            
            return res.status(201).json({
                success: true,
                message: 'Commande créée avec succès',
                data: newOrder
            });
        } catch (error) {
            logger.error('Erreur lors de la création d\'une commande', { error });
            
            // Formater l'erreur pour le client
            if (error instanceof ApiError) {
                return res.status(error.statusCode).json({
                    success: false,
                    message: error.message,
                    details: error.details || {
                        body: req.body
                    }
                });
            }
            
            return res.status(500).json({
                success: false,
                message: 'Erreur lors de la création de la commande',
                details: {
                    body: req.body,
                    error: error instanceof Error ? error.message : String(error)
                }
            });
        }
    }

    /**
     * Met à jour le statut d'une commande
     */
    async updateOrderStatus(req: Request, res: Response, next: NextFunction) {
        try {
            const id = req.params.id;
            if (!id) {
                throw ApiError.badRequest('ID de commande invalide');
            }

            const { status } = req.body;
            logger.info(`Mise à jour du statut de la commande ${id}`, { status });

            const updatedOrder = await this.orderService.updateOrderStatus(id, status);
            
            // Note: La notification WebSocket est déjà gérée dans OrderService.updateOrderStatus
            // pour les commandes annulées, pas besoin de la dupliquer ici
            
            // Diffuser la notification de changement de statut via WebSocket uniquement si ce n'est pas CANCELLED
            // car cette notification est déjà envoyée dans le service
            const wsController = getWebSocketController();
            if (wsController && status !== "CANCELLED") {
                // Générer un numéro de commande simple pour l'affichage
                const orderNumber = updatedOrder.id.substring(0, 8).toUpperCase();
                wsController.broadcastOrderStatus(updatedOrder.id, orderNumber, status);
            }
            
            res.json({ 
                success: true, 
                message: 'Statut de la commande mis à jour',
                data: updatedOrder 
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Supprime une commande
     */
    async deleteOrder(req: Request, res: Response, next: NextFunction) {
        try {
            const id = req.params.id;
            if (!id) {
                throw ApiError.badRequest('ID de commande invalide');
            }

            logger.info(`Suppression de la commande ${id}`);
            await this.orderService.deleteOrder(id);
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    /**
     * Valide manuellement une commande
     */
    async validateOrder(req: Request, res: Response, next: NextFunction) {
        try {
            const id = req.params.id;
            if (!id) {
                throw ApiError.badRequest('ID de commande invalide');
            }

            logger.info(`Validation manuelle de la commande ${id}`);
            const result = await this.orderService.validateOrderManually(id);
            
            // Diffuser la notification de changement de statut via WebSocket
            const wsController = getWebSocketController();
            if (wsController) {
                // Générer un numéro de commande simple pour l'affichage
                const orderNumber = result.order.id.substring(0, 8).toUpperCase();
                wsController.broadcastOrderStatus(result.order.id, orderNumber, 'CONFIRMED');
            }
            
            res.json({
                success: true,
                message: result.message,
                data: result.order
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Récupère des statistiques sur les commandes
     */
    async getOrderStats(req: Request, res: Response, next: NextFunction) {
        try {
            logger.info('Récupération des statistiques des commandes');
            const stats = await this.orderService.getOrderStats();
            res.json({ success: true, data: stats });
        } catch (error) {
            next(error);
        }
    }
} 