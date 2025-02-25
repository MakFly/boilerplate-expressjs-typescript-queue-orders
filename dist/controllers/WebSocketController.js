"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebSocketController = exports.initWebSocketController = exports.WebSocketController = void 0;
const ws_1 = __importDefault(require("ws"));
const StockAlertService_1 = require("../services/StockAlertService");
const PrismaService_1 = require("../services/PrismaService");
const QueueService_1 = require("../services/QueueService");
const logger_1 = __importDefault(require("../utils/logger"));
class WebSocketController {
    constructor(server) {
        this.clients = new Map();
        this.notificationBuffer = [];
        this.maxBufferSize = 100;
        // Initialiser le serveur WebSocket
        this.wss = new ws_1.default.Server({ server });
        // Initialiser les services
        const prismaService = new PrismaService_1.PrismaService();
        const queueService = QueueService_1.QueueService.getInstance();
        this.stockAlertService = new StockAlertService_1.StockAlertService(prismaService, queueService);
        // Configurer les écouteurs
        this.setupEventListeners();
        // Configurer l'écouteur de notifications
        this.setupNotificationListener();
        logger_1.default.info('WebSocket server initialized');
    }
    /**
     * Configure les écouteurs d'événements WebSocket
     */
    setupEventListeners() {
        this.wss.on('connection', (ws) => {
            // Générer un ID unique pour ce client
            const clientId = Math.random().toString(36).substring(2, 15);
            // Stocker le client avec ses abonnements
            this.clients.set(ws, { id: clientId, subscriptions: [] });
            logger_1.default.info(`WebSocket client connected: ${clientId}`);
            // Envoyer un message de bienvenue
            ws.send(JSON.stringify({
                type: 'connection',
                message: 'Connected to stock alerts WebSocket server',
                clientId
            }));
            // Gérer les messages du client
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handleClientMessage(ws, data);
                }
                catch (error) {
                    logger_1.default.error('Error parsing WebSocket message:', error);
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Invalid message format'
                    }));
                }
            });
            // Gérer la déconnexion
            ws.on('close', () => {
                logger_1.default.info(`WebSocket client disconnected: ${clientId}`);
                this.clients.delete(ws);
            });
            // Envoyer les notifications récentes au nouveau client
            this.sendRecentNotifications(ws);
        });
    }
    /**
     * Gère les messages reçus des clients
     */
    handleClientMessage(ws, data) {
        const client = this.clients.get(ws);
        if (!client) {
            return;
        }
        switch (data.type) {
            case 'subscribe':
                // S'abonner à un type de notification
                if (data.channel && !client.subscriptions.includes(data.channel)) {
                    client.subscriptions.push(data.channel);
                    logger_1.default.info(`Client ${client.id} subscribed to ${data.channel}`);
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
                    logger_1.default.info(`Client ${client.id} unsubscribed from ${data.channel}`);
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
                logger_1.default.warn(`Unknown message type: ${data.type}`);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Unknown message type'
                }));
        }
    }
    /**
     * Configure l'écouteur de notifications
     */
    setupNotificationListener() {
        // S'abonner aux notifications d'alertes de stock
        this.stockAlertService.onNotification((notification) => {
            // Ajouter la notification au buffer
            this.addToNotificationBuffer(notification);
            // Diffuser la notification aux clients abonnés
            this.broadcastNotification(notification);
        });
    }
    /**
     * Ajoute une notification au buffer
     */
    addToNotificationBuffer(notification) {
        this.notificationBuffer.unshift(notification);
        // Limiter la taille du buffer
        if (this.notificationBuffer.length > this.maxBufferSize) {
            this.notificationBuffer = this.notificationBuffer.slice(0, this.maxBufferSize);
        }
    }
    /**
     * Diffuse une notification à tous les clients abonnés
     */
    broadcastNotification(notification) {
        const message = JSON.stringify({
            type: 'notification',
            data: notification
        });
        this.clients.forEach((client, ws) => {
            // Vérifier si le client est abonné à ce type de notification
            const shouldSend = client.subscriptions.includes('all') ||
                client.subscriptions.includes(`alert:${notification.type}`) ||
                (notification.severity === 'CRITICAL' && client.subscriptions.includes('critical')) ||
                (notification.severity === 'HIGH' && client.subscriptions.includes('high'));
            if (shouldSend && ws.readyState === ws_1.default.OPEN) {
                ws.send(message);
            }
        });
    }
    /**
     * Envoie les notifications récentes à un client
     */
    async sendRecentNotifications(ws) {
        try {
            // Récupérer les notifications récentes
            const notifications = await this.stockAlertService.getRecentNotifications(20);
            // Envoyer les notifications au client
            if (ws.readyState === ws_1.default.OPEN) {
                ws.send(JSON.stringify({
                    type: 'recent_notifications',
                    data: notifications
                }));
            }
        }
        catch (error) {
            logger_1.default.error('Error sending recent notifications:', error);
        }
    }
    /**
     * Diffuse un message de log à tous les clients abonnés
     */
    broadcastLogMessage(logMessage) {
        const message = JSON.stringify({
            type: 'log',
            data: logMessage
        });
        this.clients.forEach((client, ws) => {
            if (client.subscriptions.includes('logs') && ws.readyState === ws_1.default.OPEN) {
                ws.send(message);
            }
        });
    }
}
exports.WebSocketController = WebSocketController;
// Singleton pour accéder au contrôleur WebSocket
let wsControllerInstance = null;
const initWebSocketController = (server) => {
    if (!wsControllerInstance) {
        wsControllerInstance = new WebSocketController(server);
    }
    return wsControllerInstance;
};
exports.initWebSocketController = initWebSocketController;
const getWebSocketController = () => {
    return wsControllerInstance;
};
exports.getWebSocketController = getWebSocketController;
