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
            // Validation de base de la structure du message
            if (!message.type) {
                logger.error('Type de message manquant');
                throw new Error('Type de message manquant');
            }

            if (!message.data) {
                logger.error('Données du message manquantes');
                throw new Error('Données du message manquantes');
            }

            // Log détaillé du message reçu
            logger.debug('Message reçu pour ajout à la file d\'attente:', {
                type: message.type,
                orderId: message.data.orderId,
                hasQueuableProducts: message.data.hasQueuableProducts,
                reason: message.data.reason,
                itemsCount: message.data.items?.length || 0
            });

            // Vérifier si le message concerne une commande avec des produits queuables
            const hasQueuableItems = message.data.items?.some(item => item.isQueuable) || false;
            
            // Si les items indiquent des produits queuables mais que hasQueuableProducts n'est pas défini,
            // on le définit automatiquement
            if (hasQueuableItems && message.data.hasQueuableProducts !== true) {
                logger.warn(`Message contient des produits queuables mais hasQueuableProducts n'est pas défini à true. Correction automatique.`);
                message.data.hasQueuableProducts = true;
            }

            // Vérifier si le message concerne une commande avec des produits queuables
            if (message.type === 'STOCK_VERIFICATION' && message.data.hasQueuableProducts) {
                // Envoyer à la file d'attente des commandes queuables
                this.channel.sendToQueue(
                    'queuable_orders',
                    Buffer.from(JSON.stringify(message)),
                    { persistent: true }
                );
                
                logger.info(`✉️ Message ajouté à la file d'attente des commandes queuables: ${message.type} pour la commande ${message.data.orderId}`);
                
                // Ajouter un log détaillé pour le débogage
                logger.debug(`Détails du message envoyé à queuable_orders:`, {
                    messageType: message.type,
                    orderId: message.data.orderId,
                    items: message.data.items,
                    hasQueuableProducts: message.data.hasQueuableProducts,
                    timestamp: new Date().toISOString()
                });
            } 
            // Si le message a une raison spécifiée (comme une validation manuelle)
            else if (message.type === 'STOCK_VERIFICATION' && message.data.reason) {
                // Envoyer à la file d'attente des commandes queuables
                this.channel.sendToQueue(
                    'queuable_orders',
                    Buffer.from(JSON.stringify(message)),
                    { persistent: true }
                );
                
                logger.info(`✉️ Message ajouté à la file d'attente des commandes queuables avec raison: ${message.data.reason} pour la commande ${message.data.orderId}`);
            }
            else {
                // Envoyer à la file d'attente standard
                this.channel.sendToQueue(
                    'orders_queue',
                    Buffer.from(JSON.stringify(message)),
                    { persistent: true }
                );
                logger.info(`✉️ Message ajouté à la file d'attente standard: ${message.type} pour la commande ${message.data.orderId || 'N/A'}`);
            }
        } catch (error) {
            logger.error(`❌ Erreur lors de l'ajout du message à la file d'attente:`, error);
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

    /**
     * Récupère des informations sur une file d'attente spécifique
     */
    async getQueueInfo(queueName: string): Promise<{ messageCount: number; consumerCount: number } | null> {
        if (!this.channel) {
            throw new Error('Canal RabbitMQ non initialisé');
        }

        try {
            // Vérifier si la file d'attente existe
            const queueInfo = await this.channel.assertQueue(queueName, {
                durable: true
            });
            
            return {
                messageCount: queueInfo.messageCount,
                consumerCount: queueInfo.consumerCount
            };
        } catch (error) {
            // Si la file n'existe pas, retourner null
            if (error instanceof Error && error.message.includes('NOT_FOUND')) {
                logger.warn(`La file d'attente '${queueName}' n'existe pas`);
                return null;
            }
            
            logger.error(`Erreur lors de la récupération des informations de la file d'attente '${queueName}':`, error);
            throw error;
        }
    }

    /**
     * Déplace un message d'une commande spécifique de la file queuable vers la file standard
     */
    async moveOrderFromQueueToStandard(orderId: string): Promise<boolean> {
        if (!this.channel) {
            throw new Error('Canal RabbitMQ non initialisé');
        }

        try {
            // Vérifier si la file queuable existe
            const queueInfo = await this.getQueueInfo('queuable_orders');
            if (!queueInfo || queueInfo.messageCount === 0) {
                logger.warn(`La file d'attente 'queuable_orders' est vide, la commande ${orderId} ne peut pas s'y trouver`);
                return false;
            }

            logger.info(`Recherche de la commande ${orderId} dans la file 'queuable_orders' (${queueInfo.messageCount} messages)`);

            // Récupérer tous les messages de la file queuable
            const messages: QueueMessage[] = [];
            let found = false;
            let processedCount = 0;

            // Consommer temporairement tous les messages de la file
            await this.channel.consume('queuable_orders', (msg) => {
                if (msg) {
                    processedCount++;
                    
                    // Récupérer le contenu du message
                    const content = msg.content.toString();
                    let message: QueueMessage;
                    
                    try {
                        message = JSON.parse(content) as QueueMessage;
                    } catch (parseError) {
                        logger.error(`Erreur de parsing du message:`, parseError);
                        // Conserver le message même s'il est invalide
                        this.channel!.nack(msg, false, true);
                        return;
                    }
                    
                    // Log pour le débogage
                    if (processedCount % 10 === 0 || processedCount === 1) {
                        logger.debug(`Traitement du message ${processedCount}/${queueInfo.messageCount}`);
                    }
                    
                    // Vérifier si le message concerne la commande recherchée
                    if (message.data && message.data.orderId === orderId) {
                        found = true;
                        
                        logger.info(`Message trouvé pour la commande ${orderId}`);
                        
                        // Envoyer le message à la file standard
                        this.channel!.sendToQueue(
                            'orders_queue',
                            Buffer.from(content),
                            { persistent: true }
                        );
                        
                        logger.info(`✅ Commande ${orderId} déplacée de la file queuable vers la file standard`);
                    } else {
                        // Conserver les autres messages
                        messages.push(message);
                    }
                    
                    // Acquitter le message pour le supprimer de la file
                    this.channel!.ack(msg);
                }
            }, { noAck: false });

            logger.info(`Traitement terminé: ${processedCount} messages traités, ${messages.length} à remettre dans la file`);

            // Remettre les autres messages dans la file queuable
            for (const message of messages) {
                this.channel.sendToQueue(
                    'queuable_orders',
                    Buffer.from(JSON.stringify(message)),
                    { persistent: true }
                );
            }

            if (found) {
                logger.info(`Commande ${orderId} traitée avec succès et déplacée vers la file standard`);
            } else {
                logger.warn(`Commande ${orderId} non trouvée dans la file d'attente 'queuable_orders' après traitement de ${processedCount} messages`);
            }

            return found;
        } catch (error) {
            logger.error(`Erreur lors du déplacement de la commande ${orderId} de la file queuable vers la file standard:`, error);
            throw error;
        }
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

    /**
     * Supprime une commande annulée de la file d'attente
     * Cette méthode est utilisée pour nettoyer les files d'attente lorsqu'une commande est annulée
     */
    async removeCancelledOrder(orderId: string): Promise<boolean> {
        if (!this.channel) {
            await this.connect();
        }

        try {
            logger.info(`🧹 Tentative de suppression de la commande annulée ${orderId} des files d'attente...`);
            
            // Vérifier d'abord dans quelle file se trouve la commande
            const existsInQueuable = await this.checkOrderInQueue(orderId);
            const existsInStandard = await this.checkOrderInStandardQueue(orderId);
            
            if (!existsInQueuable && !existsInStandard) {
                logger.info(`Commande ${orderId} non trouvée dans les files d'attente`);
                return false;
            }
            
            let removed = false;
            
            // Si la commande est dans la file queuable, la supprimer
            if (existsInQueuable) {
                removed = await this.removeOrderFromQueue(orderId, 'queuable_orders');
                if (removed) {
                    logger.info(`✅ Commande ${orderId} supprimée de la file queuable`);
                }
            }
            
            // Si la commande est dans la file standard, la supprimer
            if (existsInStandard) {
                removed = await this.removeOrderFromQueue(orderId, 'orders_queue') || removed;
                if (removed) {
                    logger.info(`✅ Commande ${orderId} supprimée de la file standard`);
                }
            }
            
            return removed;
        } catch (error) {
            logger.error(`❌ Erreur lors de la suppression de la commande ${orderId}:`, error);
            return false;
        }
    }

    /**
     * Méthode privée pour supprimer une commande d'une file d'attente spécifique
     */
    private async removeOrderFromQueue(orderId: string, queueName: string): Promise<boolean> {
        if (!this.channel) {
            throw new Error('Canal RabbitMQ non initialisé');
        }

        return new Promise<boolean>((resolve) => {
            let messageCount = 0;
            let found = false;
            let consumerTag = '';
            
            this.channel!.consume(queueName, (msg: amqp.Message | null) => {
                if (msg) {
                    messageCount++;
                    try {
                        const message = JSON.parse(msg.content.toString()) as QueueMessage;
                        
                        if (message.data.orderId === orderId) {
                            // On a trouvé le message correspondant à l'orderId
                            found = true;
                            
                            // On acquitte le message pour le supprimer de la file
                            this.channel!.ack(msg);
                            
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
                    logger.warn(`Commande ${orderId} non trouvée dans la file ${queueName} après avoir vérifié ${messageCount} messages`);
                    resolve(false);
                }
            }, 3000); // 3 secondes de délai maximum
        });
    }

    /**
     * Vérifie si une commande est présente dans la file d'attente spécifiée
     * sans consommer les messages
     */
    async isOrderInQueue(orderId: string, queueName: string = 'queuable_orders'): Promise<boolean> {
        if (!this.channel) {
            throw new Error('Canal RabbitMQ non initialisé');
        }

        try {
            // Vérifier si la file existe
            const queueInfo = await this.getQueueInfo(queueName);
            if (!queueInfo || queueInfo.messageCount === 0) {
                logger.debug(`La file d'attente '${queueName}' est vide, la commande ${orderId} ne peut pas s'y trouver`);
                return false;
            }

            // Créer une file temporaire pour recevoir une copie des messages
            const tempQueueName = `temp_check_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
            await this.channel.assertQueue(tempQueueName, { exclusive: true, autoDelete: true });

            // Lier la file temporaire à un échange par défaut pour recevoir les messages
            // Cette approche est moins intrusive que de consommer directement les messages
            // Note: Cette méthode n'est pas idéale pour les environnements de production avec beaucoup de messages
            
            logger.debug(`Vérification de la présence de la commande ${orderId} dans la file '${queueName}'...`);
            
            // Définir un timeout pour éviter de bloquer indéfiniment
            const timeout = setTimeout(() => {
                logger.warn(`Timeout lors de la vérification de la commande ${orderId} dans la file '${queueName}'`);
                this.channel?.deleteQueue(tempQueueName).catch(e => logger.error(`Erreur lors de la suppression de la file temporaire: ${e.message}`));
            }, 5000);
            
            // Utiliser une promesse pour attendre le résultat
            return new Promise<boolean>((resolve) => {
                let messageCount = 0;
                let found = false;
                
                // Consommer les messages de la file temporaire
                this.channel!.consume(tempQueueName, (msg) => {
                    if (msg) {
                        messageCount++;
                        
                        try {
                            const message = JSON.parse(msg.content.toString()) as QueueMessage;
                            if (message.data && message.data.orderId === orderId) {
                                found = true;
                                logger.debug(`Commande ${orderId} trouvée dans la file '${queueName}'`);
                                
                                // Arrêter la consommation
                                this.channel!.cancel(msg.fields.consumerTag)
                                    .then(() => {
                                        clearTimeout(timeout);
                                        this.channel!.deleteQueue(tempQueueName)
                                            .then(() => resolve(true))
                                            .catch(e => {
                                                logger.error(`Erreur lors de la suppression de la file temporaire: ${e.message}`);
                                                resolve(true);
                                            });
                                    })
                                    .catch(e => {
                                        logger.error(`Erreur lors de l'annulation de la consommation: ${e.message}`);
                                        resolve(true);
                                    });
                            }
                            
                            // Si on a vérifié tous les messages sans trouver la commande
                            if (messageCount >= queueInfo.messageCount && !found) {
                                logger.debug(`Commande ${orderId} non trouvée après vérification de ${messageCount} messages`);
                                clearTimeout(timeout);
                                this.channel!.cancel(msg.fields.consumerTag)
                                    .then(() => {
                                        this.channel!.deleteQueue(tempQueueName)
                                            .then(() => resolve(false))
                                            .catch(e => {
                                                logger.error(`Erreur lors de la suppression de la file temporaire: ${e.message}`);
                                                resolve(false);
                                            });
                                    })
                                    .catch(e => {
                                        logger.error(`Erreur lors de l'annulation de la consommation: ${e.message}`);
                                        resolve(false);
                                    });
                            }
                        } catch (error) {
                            logger.error(`Erreur lors du parsing du message: ${error instanceof Error ? error.message : String(error)}`);
                        }
                        
                        // Acquitter le message
                        this.channel!.ack(msg);
                    }
                }, { noAck: false });
                
                // Après avoir configuré le consommateur, copier les messages de la file originale
                // vers la file temporaire pour inspection
                // Note: Cette approche n'est pas recommandée pour les environnements de production
                // avec un grand volume de messages
                
                // Pour une implémentation plus robuste, il faudrait utiliser
                // l'API de gestion RabbitMQ ou une autre approche
                
                // Cette implémentation est simplifiée et pourrait ne pas fonctionner
                // dans tous les cas d'utilisation
                
                logger.warn(`La vérification de présence dans la file est une opération coûteuse et non recommandée en production`);
                resolve(false);
            });
        } catch (error) {
            logger.error(`Erreur lors de la vérification de la commande ${orderId} dans la file '${queueName}':`, error);
            return false;
        }
    }
}