import { Request, Response, NextFunction } from 'express';
import { StockTransactionService } from '../services/stocks/StockTransactionService';
import { StockAlertService } from '../services/stocks/StockAlertService';
import logger from '../utils/logger';
import { PrismaService } from '../services/PrismaService';
import { StockService } from '../services/stocks/StockService';
import { StockRepository } from '../repositories/StockRepository';
import { StockAlertType } from '../types/stock.types';
import { AppError } from '../utils/AppError';

export class StockController {
    private stockTransactionService: StockTransactionService;
    private stockAlertService: StockAlertService;
    private prismaService: PrismaService;
    private stockService: StockService;
    private stockRepository: StockRepository;

    constructor() {
        this.prismaService = new PrismaService();
        this.stockRepository = new StockRepository(this.prismaService);
        this.stockService = new StockService(this.stockRepository, this.prismaService);
        this.stockAlertService = new StockAlertService(this.prismaService);
        this.stockTransactionService = new StockTransactionService();
    }

    // Méthodes pour les transactions de stock
    async getTransactions(req: Request, res: Response): Promise<void> {
        try {
            const transactions = await this.stockTransactionService.getTransactions();
            res.json(transactions);
        } catch (error) {
            logger.error('Error getting stock transactions:', error);
            res.status(500).json({ error: 'Failed to get stock transactions' });
        }
    }

    async createTransaction(req: Request, res: Response): Promise<void> {
        try {
            const transaction = await this.stockTransactionService.createTransaction(req.body);
            res.status(201).json(transaction);
        } catch (error) {
            logger.error('Error creating stock transaction:', error);
            res.status(500).json({ error: 'Failed to create stock transaction' });
        }
    }

    // Méthodes pour les alertes de stock
    async getAlerts(req: Request, res: Response): Promise<void> {
        try {
            const { resolved } = req.query;
            const options = {
                resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined
            };
            const alerts = await this.stockAlertService.getAlerts(options);
            res.json(alerts);
        } catch (error) {
            logger.error('Error getting stock alerts:', error);
            res.status(500).json({ error: 'Failed to get stock alerts' });
        }
    }

    async getAlertById(req: Request, res: Response): Promise<void> {
        try {
            const alert = await this.stockAlertService.getAlertById(req.params.id);
            if (!alert) {
                res.status(404).json({ error: 'Stock alert not found' });
                return;
            }
            res.json(alert);
        } catch (error) {
            logger.error(`Error getting stock alert by ID ${req.params.id}:`, error);
            res.status(500).json({ error: 'Failed to get stock alert' });
        }
    }

    /**
     * Marque une alerte comme résolue
     */
    async resolveAlert(req: Request, res: Response, next: NextFunction) {
        try {
            const alertId = req.params.id;
            if (!alertId) {
                throw new AppError('ID d\'alerte manquant', 400);
            }
            
            // Marquer l'alerte comme résolue
            const alert = await this.stockAlertService.markAlertAsRead(alertId);
            
            res.json({
                success: true,
                message: 'Alerte marquée comme résolue',
                data: alert
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Récupère toutes les notifications
     */
    async getNotifications(req: Request, res: Response, next: NextFunction) {
        try {
            // Récupérer les notifications (qui sont des alertes de type PROCESSED)
            const notifications = await this.stockAlertService.getAlertsByType(StockAlertType.PROCESSED, {
                limit: parseInt(req.query.limit as string) || 10,
                offset: parseInt(req.query.offset as string) || 0
            });
            
            res.json({
                success: true,
                data: notifications
            });
        } catch (error) {
            next(error);
        }
    }

    async markNotificationAsRead(req: Request, res: Response): Promise<void> {
        try {
            const notification = await this.stockAlertService.markNotificationAsRead(req.params.id);
            res.json(notification);
        } catch (error) {
            logger.error(`Error marking notification ${req.params.id} as read:`, error);
            res.status(500).json({ error: 'Failed to mark notification as read' });
        }
    }

    async markAllNotificationsAsRead(req: Request, res: Response): Promise<void> {
        try {
            const count = await this.stockAlertService.markAllNotificationsAsRead();
            res.json({ success: true, count });
        } catch (error) {
            logger.error('Error marking all notifications as read:', error);
            res.status(500).json({ error: 'Failed to mark all notifications as read' });
        }
    }

    async getUnreadNotificationsCount(req: Request, res: Response): Promise<void> {
        try {
            const count = await this.stockAlertService.getUnreadNotificationsCount();
            res.json({ count });
        } catch (error) {
            logger.error('Error getting unread notifications count:', error);
            res.status(500).json({ error: 'Failed to get unread notifications count' });
        }
    }

    async getAlertStats(req: Request, res: Response): Promise<void> {
        try {
            const stats = await this.stockAlertService.getAlertStats();
            res.json(stats);
        } catch (error) {
            logger.error('Error getting alert stats:', error);
            res.status(500).json({ error: 'Failed to get alert stats' });
        }
    }
} 