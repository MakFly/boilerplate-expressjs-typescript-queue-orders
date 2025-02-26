import { Request, Response, NextFunction } from 'express';
import { StockAlertService } from '../services/stocks/StockAlertService';
import { PrismaService } from '../services/PrismaService';
import { ApiError } from '../utils/ApiError';
import logger from '../utils/logger';
import { StockAlertType } from '../types/stock.types';

export class StockAlertController {
    private stockAlertService: StockAlertService;
    
    constructor() {
        const prismaService = new PrismaService();
        this.stockAlertService = new StockAlertService(prismaService);
    }
    
    /**
     * Récupère toutes les alertes de stock
     */
    async getAllAlerts(req: Request, res: Response, next: NextFunction) {
        try {
            const { type, productId, limit = '50', offset = '0' } = req.query;
            
            logger.info('Récupération des alertes de stock', { type, productId, limit, offset });
            
            // Construire les filtres
            const filters: any = {};
            
            // Ajouter le type si spécifié
            if (type) {
                filters.type = type.toString();
            }
            
            // Ajouter l'ID du produit si spécifié
            if (productId) {
                filters.product_id = productId.toString();
            }
            
            // Convertir limit et offset en nombres
            const limitNum = parseInt(limit.toString());
            const offsetNum = parseInt(offset.toString());
            
            // Appeler la méthode getAlerts avec les bons paramètres
            const alerts = await this.stockAlertService.getAlerts(
                filters,
                limitNum,
                offsetNum
            );
            
            res.json({ success: true, data: alerts });
        } catch (error) {
            // Propager l'erreur au middleware de gestion d'erreurs
            next(error instanceof Error 
                ? ApiError.internal('Erreur lors de la récupération des alertes de stock', { originalError: error.message, stack: error.stack }) 
                : ApiError.internal('Erreur lors de la récupération des alertes de stock', { originalError: error }));
        }
    }
    
    /**
     * Récupère une alerte de stock par son ID
     */
    async getAlertById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = req.params.id;
            
            logger.info(`Récupération de l'alerte de stock ${id}`);
            
            const alert = await this.stockAlertService.getAlertById(id);
            
            if (!alert) {
                throw ApiError.notFound('Alerte de stock non trouvée');
            }
            
            res.json({ success: true, data: alert });
        } catch (error) {
            // Propager l'erreur au middleware de gestion d'erreurs
            next(error);
        }
    }
    
    /**
     * Récupère les notifications récentes
     */
    async getRecentNotifications(req: Request, res: Response, next: NextFunction) {
        try {
            const { limit = '20' } = req.query;
            
            logger.info('Récupération des notifications récentes', { limit });
            
            const notifications = await this.stockAlertService.getRecentNotifications(
                parseInt(limit.toString())
            );
            
            res.json({ success: true, data: notifications });
        } catch (error) {
            // Propager l'erreur au middleware de gestion d'erreurs
            next(error instanceof Error 
                ? ApiError.internal('Erreur lors de la récupération des notifications', { originalError: error.message, stack: error.stack }) 
                : ApiError.internal('Erreur lors de la récupération des notifications', { originalError: error }));
        }
    }
    
    /**
     * Marque une notification comme lue
     */
    async markNotificationAsRead(req: Request, res: Response, next: NextFunction) {
        try {
            const id = req.params.id;
            
            logger.info(`Marquage de la notification ${id} comme lue`);
            
            await this.stockAlertService.markNotificationAsRead(id);
            
            res.json({ success: true, message: 'Notification marquée comme lue' });
        } catch (error) {
            // Propager l'erreur au middleware de gestion d'erreurs
            next(error instanceof Error 
                ? ApiError.internal(`Erreur lors du marquage de la notification ${req.params.id} comme lue`, { originalError: error.message, stack: error.stack }) 
                : ApiError.internal(`Erreur lors du marquage de la notification ${req.params.id} comme lue`, { originalError: error }));
        }
    }
    
    /**
     * Récupère les statistiques des alertes
     */
    async getAlertStats(req: Request, res: Response, next: NextFunction) {
        try {
            logger.info('Récupération des statistiques des alertes');
            
            const stats = await this.stockAlertService.getAlertStats();
            
            res.json({ success: true, data: stats });
        } catch (error) {
            // Propager l'erreur au middleware de gestion d'erreurs
            next(error instanceof Error 
                ? ApiError.internal('Erreur lors de la récupération des statistiques', { originalError: error.message, stack: error.stack }) 
                : ApiError.internal('Erreur lors de la récupération des statistiques', { originalError: error }));
        }
    }
    
    /**
     * Marque toutes les notifications comme lues
     */
    async markAllNotificationsAsRead(req: Request, res: Response, next: NextFunction) {
        try {
            logger.info('Marquage de toutes les notifications comme lues');
            
            await this.stockAlertService.markAllNotificationsAsRead();
            
            res.json({ success: true, message: 'Toutes les notifications ont été marquées comme lues' });
        } catch (error) {
            // Propager l'erreur au middleware de gestion d'erreurs
            next(error instanceof Error 
                ? ApiError.internal('Erreur lors du marquage des notifications comme lues', { originalError: error.message, stack: error.stack }) 
                : ApiError.internal('Erreur lors du marquage des notifications comme lues', { originalError: error }));
        }
    }
    
    /**
     * Récupère le nombre de notifications non lues
     */
    async getUnreadNotificationsCount(req: Request, res: Response, next: NextFunction) {
        try {
            logger.info('Récupération du nombre de notifications non lues');
            
            const count = await this.stockAlertService.getUnreadNotificationsCount();
            
            res.json({ success: true, data: { count } });
        } catch (error) {
            // Propager l'erreur au middleware de gestion d'erreurs
            next(error instanceof Error 
                ? ApiError.internal('Erreur lors de la récupération du nombre de notifications non lues', { originalError: error.message, stack: error.stack }) 
                : ApiError.internal('Erreur lors de la récupération du nombre de notifications non lues', { originalError: error }));
        }
    }
} 