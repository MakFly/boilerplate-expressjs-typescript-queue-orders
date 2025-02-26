import WebSocket from 'ws';
import http from 'http';
import { StockAlertService } from '../services/stocks/StockAlertService';
import { PrismaService } from '../services/PrismaService';
import { QueueService } from '../services/QueueService';
import { StockAlertNotification } from '../types/stock.types';
import logger from '../utils/logger';
import url from 'url';

export class WebSocketController {
    private wss: WebSocket.Server;
    private stockAlertService: StockAlertService;
    private clients: Map<WebSocket, { id: string; subscriptions: string[] }> = new Map();
    private notificationBuffer: StockAlertNotification[] = [];
    private maxBufferSize = 100;

    constructor(server: http.Server) {
        // Initialiser le serveur WebSocket avec le chemin /ws
        this.wss = new WebSocket.Server({ 
            server,
            path: '/ws'
        });
        
        // Initialiser les services
        const prismaService = new PrismaService();
        const queueService = QueueService.getInstance();
        this.stockAlertService = new StockAlertService(prismaService);
        
        // Configurer les écouteurs
        this.setupEventListeners();
        
        // Configurer l'écouteur de notifications
        this.setupNotificationListener();
        
        logger.info('WebSocket server initialized on path /ws');
    }

    /**
     * Configure les écouteurs d'événements WebSocket
     */
    private setupEventListeners(): void {
        this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
            // Générer un ID unique pour ce client
            const clientId = Math.random().toString(36).substring(2, 15);
            
            // Stocker le client avec ses abonnements
            this.clients.set(ws, { id: clientId, subscriptions: [] });
            
            logger.info(`WebSocket client connected: ${clientId} from ${req.socket.remoteAddress}`);
            
            // Envoyer un message de bienvenue
            ws.send(JSON.stringify({
                type: 'connection',
                message: 'Connected to stock alerts WebSocket server',
                clientId
            }));
            
            // Gérer les messages du client
            ws.on('message', (message: string) => {
                try {
                    const data = JSON.parse(message.toString());
                    this.handleClientMessage(ws, data);
                } catch (error) {
                    logger.error('Error parsing WebSocket message:', error);
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Invalid message format'
                    }));
                }
            });
            
            // Gérer la déconnexion
            ws.on('close', () => {
                logger.info(`WebSocket client disconnected: ${clientId}`);
                this.clients.delete(ws);
            });
            
            // Envoyer les notifications récentes au nouveau client
            this.sendRecentNotifications(ws);
        });
    }

    /**
     * Gère les messages reçus des clients
     */
    private handleClientMessage(ws: WebSocket, data: any): void {
        const client = this.clients.get(ws);
        
        if (!client) {
            return;
        }
        
        switch (data.type) {
            case 'subscribe':
                // S'abonner à un type de notification
                if (data.channel && !client.subscriptions.includes(data.channel)) {
                    client.subscriptions.push(data.channel);
                    logger.info(`Client ${client.id} subscribed to ${data.channel}`);
                    
                    ws.send(JSON.stringify({
                        type: 'subscription',
                        status: 'success',
                        channel: data.channel
                    }));
                }
                break;
                
            case 'unsubscribe':
                // Se désabonner d'un type de notification
                if (data.channel) {
                    client.subscriptions = client.subscriptions.filter(ch => ch !== data.channel);
                    logger.info(`Client ${client.id} unsubscribed from ${data.channel}`);
                    
                    ws.send(JSON.stringify({
                        type: 'subscription',
                        status: 'removed',
                        channel: data.channel
                    }));
                }
                break;
                
            case 'ping':
                // Répondre aux pings pour maintenir la connexion active
                ws.send(JSON.stringify({ type: 'pong' }));
                break;
                
            default:
                logger.warn(`Unknown message type: ${data.type}`);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Unknown message type'
                }));
        }
    }

    /**
     * Configure l'écouteur de notifications
     */
    private setupNotificationListener(): void {
        // S'abonner aux notifications d'alertes de stock
        this.stockAlertService.onNotification((notification: StockAlertNotification) => {
            // Ajouter la notification au buffer
            this.addToNotificationBuffer(notification);
            
            // Diffuser la notification aux clients abonnés
            this.broadcastNotification(notification);
        });
    }

    /**
     * Ajoute une notification au buffer
     */
    private addToNotificationBuffer(notification: StockAlertNotification): void {
        this.notificationBuffer.unshift(notification);
        
        // Limiter la taille du buffer
        if (this.notificationBuffer.length > this.maxBufferSize) {
            this.notificationBuffer = this.notificationBuffer.slice(0, this.maxBufferSize);
        }
    }

    /**
     * Diffuse une notification à tous les clients abonnés
     */
    private broadcastNotification(notification: StockAlertNotification): void {
        const message = JSON.stringify({
            type: 'notification',
            data: notification
        });
        
        this.clients.forEach((client, ws) => {
            // Vérifier si le client est abonné à ce type de notification
            const shouldSend = 
                client.subscriptions.includes('all') || 
                client.subscriptions.includes(`alert:${notification.type}`) ||
                (notification.severity === 'CRITICAL' && client.subscriptions.includes('critical')) ||
                (notification.severity === 'HIGH' && client.subscriptions.includes('high'));
            
            if (shouldSend && ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }

    /**
     * Envoie les notifications récentes à un client
     */
    private async sendRecentNotifications(ws: WebSocket): Promise<void> {
        try {
            // Récupérer les notifications récentes
            const notifications = await this.stockAlertService.getRecentNotifications(20);
            
            // Envoyer les notifications au client
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'recent_notifications',
                    data: notifications
                }));
            }
        } catch (error) {
            logger.error('Error sending recent notifications:', error);
        }
    }

    /**
     * Diffuse un message de log à tous les clients abonnés
     */
    broadcastLogMessage(logMessage: any): void {
        const message = JSON.stringify({
            type: 'log',
            data: logMessage
        });
        
        this.clients.forEach((client, ws) => {
            if (client.subscriptions.includes('logs') && ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }

    /**
     * Diffuse une notification de changement de statut d'une commande
     * @param orderId ID de la commande
     * @param orderNumber Numéro de la commande
     * @param status Nouveau statut de la commande
     */
    broadcastOrderStatus(orderId: string, orderNumber: string, status: string): void {
        const message = JSON.stringify({
            type: 'order:status',
            data: {
                orderId,
                orderNumber,
                status
            }
        });
        
        logger.info(`📢 Diffusion du changement de statut de la commande ${orderNumber} à ${status}`);
        
        // Envoyer à tous les clients connectés
        this.clients.forEach((client, ws) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }

    /**
     * Diffuse une notification de nouvelle commande
     * @param order Données de la commande
     */
    broadcastNewOrder(order: any): void {
        const message = JSON.stringify({
            type: 'order:new',
            data: order
        });
        
        logger.info(`📢 Diffusion de la nouvelle commande ${order.id}`);
        
        // Envoyer à tous les clients connectés
        this.clients.forEach((client, ws) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }

    /**
     * Diffuse une notification d'alerte de stock à tous les clients abonnés
     * @param notification Notification d'alerte de stock à diffuser
     */
    broadcastStockNotification(notification: StockAlertNotification): void {
        const message = JSON.stringify({
            type: 'stock:notification',
            data: notification
        });
        
        logger.info(`📢 Diffusion d'une notification de stock: [${notification.severity}] ${notification.message}`);
        
        // Envoyer aux clients abonnés
        this.clients.forEach((client, ws) => {
            const shouldSend = 
                client.subscriptions.includes('all') || 
                client.subscriptions.includes('stock') ||
                client.subscriptions.includes(`stock:${notification.type}`) ||
                (notification.severity === 'CRITICAL' && client.subscriptions.includes('critical')) ||
                (notification.severity === 'HIGH' && client.subscriptions.includes('high'));
            
            if (shouldSend && ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
        
        // Ajouter au buffer de notifications
        this.notificationBuffer.unshift(notification);
        if (this.notificationBuffer.length > this.maxBufferSize) {
            this.notificationBuffer = this.notificationBuffer.slice(0, this.maxBufferSize);
        }
    }
}

// Singleton pour accéder au contrôleur WebSocket
let wsControllerInstance: WebSocketController | null = null;

export const initWebSocketController = (server: http.Server): WebSocketController => {
    if (!wsControllerInstance) {
        wsControllerInstance = new WebSocketController(server);
    }
    return wsControllerInstance;
};

export const getWebSocketController = (): WebSocketController | null => {
    return wsControllerInstance;
}; 