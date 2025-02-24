import amqp from 'amqplib';
import { QueueMessage } from '../types/order.types';
import logger from '../utils/logger';

interface QueueOptions {
    prefetch?: number;
}

export class QueueService {
    private static instance: QueueService;
    private connection: amqp.Connection | null = null;
    private channel: amqp.Channel | null = null;

    private constructor() {}

    static getInstance(): QueueService {
        if (!QueueService.instance) {
            QueueService.instance = new QueueService();
        }
        return QueueService.instance;
    }

    async connect(): Promise<void> {
        try {
            const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
            logger.info('🔌 Tentative de connexion à RabbitMQ:', rabbitmqUrl);
            this.connection = await amqp.connect(rabbitmqUrl);
            this.channel = await this.connection.createChannel();
            
            // Déclaration des queues
            await this.channel.assertQueue('orders_queue', { durable: true });
            await this.channel.assertQueue('orders_processing', { durable: true });
            
            logger.info('✅ Connexion RabbitMQ établie');
        } catch (error) {
            logger.error('❌ Erreur de connexion RabbitMQ:', error);
            throw error;
        }
    }

    async addToQueue(message: QueueMessage): Promise<void> {
        if (!this.channel) {
            throw new Error('Canal RabbitMQ non initialisé');
        }

        try {
            this.channel.sendToQueue(
                'orders_queue',
                Buffer.from(JSON.stringify(message)),
                { persistent: true }
            );
            logger.info(`✉️ Message ajouté à la file d'attente: ${message.type}`);
        } catch (error) {
            logger.error('❌ Erreur lors de l\'ajout à la file d\'attente:', error);
            throw error;
        }
    }

    async processQueue(
        callback: (message: QueueMessage) => Promise<void>,
        options: QueueOptions = {}
    ): Promise<void> {
        if (!this.channel) {
            throw new Error('Canal RabbitMQ non initialisé');
        }

        try {
            if (options.prefetch) {
                await this.channel.prefetch(options.prefetch);
            }

            this.channel.consume('orders_queue', async (msg: amqp.Message | null) => {
                if (msg) {
                    const message = JSON.parse(msg.content.toString()) as QueueMessage;
                    try {
                        await callback(message);
                        this.channel?.ack(msg);
                    } catch (error) {
                        // En cas d'erreur, on remet le message dans la queue
                        this.channel?.nack(msg);
                        logger.error('❌ Erreur lors du traitement du message:', error);
                    }
                }
            });
        } catch (error) {
            logger.error('❌ Erreur lors du traitement de la file d\'attente:', error);
            throw error;
        }
    }

    async close(): Promise<void> {
        try {
            await this.channel?.close();
            await this.connection?.close();
        } catch (error) {
            logger.error('❌ Erreur lors de la fermeture de la connexion:', error);
            throw error;
        }
    }
} 