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
    private static configuredQueues = new Set<string>();

    constructor() {}

    static getInstance(): QueueService {
        if (!QueueService.instance) {
            QueueService.instance = new QueueService();
        }
        return QueueService.instance;
    }

    async connect(): Promise<void> {
        const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
        const maxRetries = 5;
        let retries = 0;
        let connected = false;

        // Si déjà connecté, ne pas tenter de se reconnecter
        if (this.connection && this.channel) {
            return;
        }

        while (!connected && retries < maxRetries) {
            try {
                // Ne logguer qu'à la première tentative ou après plusieurs essais
                if (retries === 0 || retries === 3) {
                    logger.info(`🔌 Tentative de connexion à RabbitMQ (essai ${retries + 1}/${maxRetries})`);
                }
                
                this.connection = await amqp.connect(rabbitmqUrl);
                this.channel = await this.connection.createChannel();
                
                // Définir le prefetch si spécifié dans les variables d'environnement
                const prefetch = parseInt(process.env.WORKER_PREFETCH || '1', 10);
                await this.channel.prefetch(prefetch);
                
                // Déclaration des queues
                await this.channel.assertQueue('orders_queue', { durable: true });
                await this.channel.assertQueue('orders_processing', { durable: true });
                // Nouvelle file d'attente pour les commandes avec produits queuables
                await this.channel.assertQueue('queuable_orders', { durable: true });
                
                // Déclaration des queues pour les alertes et notifications
                await this.channel.assertQueue('stock-alerts', { durable: true });
                await this.channel.assertQueue('stock-notifications', { durable: true });
                
                connected = true;
                logger.info('✅ Connexion RabbitMQ établie');
            } catch (error) {
                retries++;
                if (retries >= maxRetries) {
                    logger.error('❌ Échec de connexion à RabbitMQ après plusieurs tentatives:', error);
                    throw error;
                }
                
                // Attendre avant de réessayer (délai exponentiel)
                const delay = Math.min(1000 * Math.pow(2, retries), 10000);
                logger.warn(`Échec de connexion à RabbitMQ. Nouvelle tentative dans ${delay/1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async addToQueue(message: QueueMessage): Promise<void> {
        if (!this.channel) {
            throw new Error('Canal RabbitMQ non initialisé');
        }

        try {
            // Vérifier si le message concerne une commande avec des produits queuables
            if (message.type === 'STOCK_VERIFICATION' && message.data.hasQueuableProducts) {
                // Envoyer à la file d'attente des commandes queuables
                this.channel.sendToQueue(
                    'queuable_orders',
                    Buffer.from(JSON.stringify(message)),
                    { persistent: true }
                );
                logger.info(`✉️ Message ajouté à la file d'attente des commandes queuables: ${message.type}`);
            } else {
                // Envoyer à la file d'attente standard
                this.channel.sendToQueue(
                    'orders_queue',
                    Buffer.from(JSON.stringify(message)),
                    { persistent: true }
                );
                logger.info(`✉️ Message ajouté à la file d'attente standard: ${message.type}`);
            }
        } catch (error) {
            logger.error('❌ Erreur lors de l\'ajout à la file d\'attente:', error);
            throw error;
        }
    }

    // Méthode pour traiter les commandes standard
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

    // Nouvelle méthode pour traiter les commandes avec produits queuables
    async processQueuableOrders(
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

            this.channel.consume('queuable_orders', async (msg: amqp.Message | null) => {
                if (msg) {
                    const message = JSON.parse(msg.content.toString()) as QueueMessage;
                    try {
                        await callback(message);
                        this.channel?.ack(msg);
                    } catch (error) {
                        // En cas d'erreur, on remet le message dans la queue
                        this.channel?.nack(msg);
                        logger.error('❌ Erreur lors du traitement du message queuable:', error);
                    }
                }
            });
        } catch (error) {
            logger.error('❌ Erreur lors du traitement de la file d\'attente des commandes queuables:', error);
            throw error;
        }
    }

    // Méthode pour vérifier si une commande existe dans la file d'attente queuable
    async checkOrderInQueue(orderId: string): Promise<boolean> {
        if (!this.channel) {
            throw new Error('Canal RabbitMQ non initialisé');
        }

        try {
            // Obtenir des informations sur la file d'attente
            const queueInfo = await this.channel.assertQueue('queuable_orders', { durable: true });
            
            if (queueInfo.messageCount === 0) {
                logger.info(`La file d'attente 'queuable_orders' est vide, la commande ${orderId} ne peut pas s'y trouver`);
                return false;
            }
            
            logger.info(`La file d'attente 'queuable_orders' contient ${queueInfo.messageCount} messages`);
            
            // Utiliser la méthode de recherche pour vérifier si la commande existe
            return new Promise<boolean>((resolve) => {
                let messageCount = 0;
                let found = false;
                let consumerTag = '';
                
                this.channel!.consume('queuable_orders', (msg: amqp.Message | null) => {
                    if (msg) {
                        messageCount++;
                        try {
                            const message = JSON.parse(msg.content.toString()) as QueueMessage;
                            
                            // Toujours remettre le message dans la file car on ne fait que vérifier
                            this.channel!.nack(msg, false, true);
                            
                            if (message.data.orderId === orderId) {
                                found = true;
                                if (consumerTag) {
                                    this.channel!.cancel(consumerTag);
                                }
                                resolve(true);
                            }
                        } catch (error) {
                            this.channel!.nack(msg, false, true);
                        }
                    }
                }, { noAck: false }).then(consumer => {
                    consumerTag = consumer.consumerTag;
                }).catch(error => {
                    logger.error(`Erreur lors de la création du consommateur: ${error}`);
                    resolve(false);
                });
                
                // Après un délai raisonnable, si on n'a pas trouvé le message, on arrête la recherche
                setTimeout(() => {
                    if (!found) {
                        if (consumerTag) {
                            this.channel!.cancel(consumerTag);
                        }
                        logger.info(`Commande ${orderId} non trouvée dans la file queuable après avoir vérifié ${messageCount} messages`);
                        resolve(false);
                    }
                }, 3000); // 3 secondes de délai maximum
            });
        } catch (error) {
            logger.error(`Erreur lors de la vérification de la commande ${orderId} dans la file:`, error);
            return false;
        }
    }

    // Méthode pour vérifier si une commande existe dans la file standard
    async checkOrderInStandardQueue(orderId: string): Promise<boolean> {
        if (!this.channel) {
            throw new Error('Canal RabbitMQ non initialisé');
        }

        try {
            // Obtenir des informations sur la file d'attente
            const queueInfo = await this.channel.assertQueue('orders_queue', { durable: true });
            
            if (queueInfo.messageCount === 0) {
                logger.info(`La file d'attente 'orders_queue' est vide, la commande ${orderId} ne peut pas s'y trouver`);
                return false;
            }
            
            logger.info(`La file d'attente 'orders_queue' contient ${queueInfo.messageCount} messages`);
            
            // Utiliser la méthode de recherche pour vérifier si la commande existe
            return new Promise<boolean>((resolve) => {
                let messageCount = 0;
                let found = false;
                let consumerTag = '';
                
                this.channel!.consume('orders_queue', (msg: amqp.Message | null) => {
                    if (msg) {
                        messageCount++;
                        try {
                            const message = JSON.parse(msg.content.toString()) as QueueMessage;
                            
                            // Toujours remettre le message dans la file car on ne fait que vérifier
                            this.channel!.nack(msg, false, true);
                            
                            if (message.data.orderId === orderId) {
                                found = true;
                                if (consumerTag) {
                                    this.channel!.cancel(consumerTag);
                                }
                                resolve(true);
                            }
                        } catch (error) {
                            this.channel!.nack(msg, false, true);
                        }
                    }
                }, { noAck: false }).then(consumer => {
                    consumerTag = consumer.consumerTag;
                }).catch(error => {
                    logger.error(`Erreur lors de la création du consommateur: ${error}`);
                    resolve(false);
                });
                
                // Après un délai raisonnable, si on n'a pas trouvé le message, on arrête la recherche
                setTimeout(() => {
                    if (!found) {
                        if (consumerTag) {
                            this.channel!.cancel(consumerTag);
                        }
                        logger.info(`Commande ${orderId} non trouvée dans la file standard après avoir vérifié ${messageCount} messages`);
                        resolve(false);
                    }
                }, 3000); // 3 secondes de délai maximum
            });
        } catch (error) {
            logger.error(`Erreur lors de la vérification de la commande ${orderId} dans la file standard:`, error);
            return false;
        }
    }

    // Méthode pour déplacer manuellement une commande de la file d'attente queuable vers la file standard
    async moveToStandardQueue(orderId: string): Promise<boolean> {
        if (!this.channel) {
            throw new Error('Canal RabbitMQ non initialisé');
        }

        try {
            // Vérifier d'abord si la commande existe dans la file d'attente
            logger.info(`Tentative de déplacement de la commande ${orderId} vers la file standard`);
            
            // Vérifier si la commande existe dans la file avant d'essayer de la déplacer
            const existsInQueuable = await this.checkOrderInQueue(orderId);
            
            if (!existsInQueuable) {
                logger.warn(`Commande ${orderId} non trouvée dans la file queuable`);
                
                // Si la commande n'est pas dans la file queuable, on vérifie si elle est déjà dans la file standard
                // Cela pourrait indiquer qu'elle a déjà été déplacée
                const existsInStandard = await this.checkOrderInStandardQueue(orderId);
                
                if (existsInStandard) {
                    logger.info(`Commande ${orderId} déjà présente dans la file standard`);
                    // On retourne true car la commande est déjà dans la file standard
                    return true;
                }
                
                // On retourne false car la commande n'a pas été déplacée (elle n'était pas dans la file)
                return false;
            }
            
            // Utiliser une approche plus robuste pour parcourir tous les messages de la file
            return new Promise<boolean>((resolve, reject) => {
                let messageCount = 0;
                let found = false;
                let consumerTag = '';
                
                // Récupérer tous les messages de la file queuable_orders
                this.channel!.consume('queuable_orders', (msg: amqp.Message | null) => {
                    if (msg) {
                        messageCount++;
                        try {
                            const message = JSON.parse(msg.content.toString()) as QueueMessage;
                            
                            if (message.data.orderId === orderId) {
                                // On a trouvé le message correspondant à l'orderId
                                found = true;
                                
                                // On l'envoie à la file standard
                                this.channel!.sendToQueue(
                                    'orders_queue',
                                    Buffer.from(JSON.stringify(message)),
                                    { persistent: true }
                                );
                                
                                // On acquitte le message de la file queuable
                                this.channel!.ack(msg);
                                
                                logger.info(`✅ Commande ${orderId} déplacée vers la file standard`);
                                
                                // Annuler le consommateur car on a trouvé ce qu'on cherchait
                                if (consumerTag) {
                                    this.channel!.cancel(consumerTag);
                                }
                                resolve(true);
                            } else {
                                // Ce n'est pas le message qu'on cherche, on le remet dans la file
                                this.channel!.nack(msg, false, true);
                            }
                        } catch (error) {
                            // En cas d'erreur de parsing, on remet le message dans la file
                            this.channel!.nack(msg, false, true);
                            logger.error(`Erreur lors du traitement d'un message: ${error}`);
                        }
                    }
                }, { noAck: false }).then(consumer => {
                    consumerTag = consumer.consumerTag;
                }).catch(error => {
                    logger.error(`Erreur lors de la création du consommateur: ${error}`);
                    resolve(false);
                });
                
                // Après un délai raisonnable, si on n'a pas trouvé le message, on arrête la recherche
                setTimeout(() => {
                    if (!found) {
                        if (consumerTag) {
                            this.channel!.cancel(consumerTag);
                        }
                        logger.warn(`Commande ${orderId} non trouvée dans la file queuable après avoir vérifié ${messageCount} messages`);
                        resolve(false);
                    }
                }, 5000); // 5 secondes de délai maximum
            });
        } catch (error) {
            logger.error(`❌ Erreur lors du déplacement de la commande ${orderId}:`, error);
            throw error;
        }
    }

    /**
     * Déplace une commande de la file d'attente queuable vers la file standard
     * Alias de moveToStandardQueue pour une meilleure lisibilité
     */
    async moveOrderFromQueueToStandard(orderId: string): Promise<boolean> {
        return this.moveToStandardQueue(orderId);
    }

    async sendMessage(queue: string, message: any): Promise<void> {
        try {
            if (!this.channel) {
                await this.connect();
            }
            await this.channel!.assertQueue(queue);
            this.channel!.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
        } catch (error) {
            logger.error(`Error sending message to queue ${queue}:`, error);
            throw error;
        }
    }

    async consumeMessages(queue: string, callback: (message: any) => Promise<void>): Promise<void> {
        try {
            if (!this.channel) {
                await this.connect();
            }
            
            // Vérifier si la queue existe déjà
            await this.channel!.assertQueue(queue);
            
            // Utiliser un préfixe unique pour chaque worker
            const consumerTag = `consumer-${process.env.WORKER_ID || 'default'}-${queue}`;
            
            // Utiliser une variable statique pour suivre les queues déjà configurées
            if (!QueueService.configuredQueues) {
                QueueService.configuredQueues = new Set<string>();
            }
            
            // Vérifier si nous avons déjà configuré cette queue
            const queueKey = `${process.env.WORKER_ID || 'default'}-${queue}`;
            if (QueueService.configuredQueues.has(queueKey)) {
                logger.info(`Queue ${queue} already configured for this worker, skipping setup`);
                return;
            }
            
            // Marquer cette queue comme configurée
            QueueService.configuredQueues.add(queueKey);
            
            await this.channel!.consume(queue, async (msg) => {
                if (msg) {
                    try {
                        const content = JSON.parse(msg.content.toString());
                        await callback(content);
                        this.channel!.ack(msg);
                    } catch (error) {
                        logger.error(`Error processing message from queue ${queue}:`, error);
                        this.channel!.nack(msg);
                    }
                }
            }, { consumerTag });
        } catch (error) {
            logger.error(`Error consuming messages from queue ${queue}:`, error);
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

    /**
     * Purge toutes les files d'attente
     * Utile pour le développement et les tests
     */
    async purgeAllQueues(): Promise<void> {
        if (!this.channel) {
            await this.connect();
        }

        try {
            logger.info('🧹 Purge de toutes les files d\'attente...');
            
            // Liste des files d'attente à purger
            const queues = [
                'orders_queue',
                'orders_processing',
                'queuable_orders',
                'stock-alerts',
                'stock-notifications'
            ];
            
            // Purger chaque file d'attente
            for (const queue of queues) {
                await this.channel!.assertQueue(queue, { durable: true });
                await this.channel!.purgeQueue(queue);
                logger.info(`✅ File d'attente '${queue}' purgée avec succès`);
            }
            
            logger.info('✅ Toutes les files d\'attente ont été purgées');
        } catch (error) {
            logger.error('❌ Erreur lors de la purge des files d\'attente:', error);
            throw error;
        }
    }
}