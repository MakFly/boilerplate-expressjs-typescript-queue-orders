import { PrismaClient } from '@prisma/client';
import { QueueService } from '../services/QueueService';
import { PrismaService } from '../services/PrismaService';
import logger from '../utils/logger';
import { StockAlertService } from '../services/stocks/StockAlertService';

// Définir l'URL de RabbitMQ pour le script
process.env.RABBITMQ_URL = 'amqp://guest:guest@rabbitmq:5672';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const queueService = QueueService.getInstance();
const stockAlertService = new StockAlertService(prismaService);

async function main() {
    // Initialiser la connexion RabbitMQ
    await queueService.connect();
    console.log('🔌 Connexion à RabbitMQ établie');

    console.log('🔍 Recherche des commandes annulées...');
    
    // Récupérer toutes les commandes annulées
    const cancelledOrders = await prisma.order.findMany({
        where: {
            status: 'CANCELLED'
        }
    });
    
    console.log(`✅ ${cancelledOrders.length} commandes annulées trouvées.`);
    
    // Supprimer chaque commande annulée des files d'attente
    console.log('🧹 Nettoyage des files d\'attente...');
    
    let removedCount = 0;
    for (const order of cancelledOrders) {
        const removed = await queueService.removeCancelledOrder(order.id);
        if (removed) {
            removedCount++;
        }
    }
    
    console.log(`✅ ${removedCount} commandes annulées supprimées des files d'attente.`);
    
    // Afficher des informations sur les files d'attente
    console.log('\n📊 État des files d\'attente:');
    
    // Vérifier l'état des files d'attente
    try {
        const channel = await queueService['channel'];
        if (channel) {
            const queuesInfo = [
                await channel.assertQueue('orders_queue', { durable: true }),
                await channel.assertQueue('queuable_orders', { durable: true })
            ];
            
            console.log(`  • File 'orders_queue': ${queuesInfo[0].messageCount} messages`);
            console.log(`  • File 'queuable_orders': ${queuesInfo[1].messageCount} messages`);
        }
    } catch (error) {
        console.error('❌ Erreur lors de la vérification des files d\'attente:', error);
    }
    
    // Nettoyer les alertes obsolètes
    console.log('\n🧹 Nettoyage des alertes obsolètes...');
    
    try {
        // Récupérer toutes les alertes de type QUEUED_ORDER
        const queuedOrderAlerts = await prisma.stockAlert.findMany({
            where: {
                type: 'QUEUED_ORDER'
            },
            include: {
                order: true
            }
        });
        
        console.log(`✅ ${queuedOrderAlerts.length} alertes de commandes en attente trouvées.`);
        
        // Vérifier si les commandes associées existent toujours et sont en attente
        let alertsToDelete = [];
        let alertsToKeep = [];
        
        for (const alert of queuedOrderAlerts) {
            // Si la commande n'existe pas ou n'est plus en attente, marquer l'alerte pour suppression
            if (!alert.order || alert.order.status !== 'PENDING') {
                alertsToDelete.push(alert);
            } else {
                alertsToKeep.push(alert);
            }
        }
        
        console.log(`🧹 ${alertsToDelete.length} alertes obsolètes à supprimer.`);
        console.log(`📊 ${alertsToKeep.length} alertes valides à conserver.`);
        
        // Supprimer les notifications associées aux alertes obsolètes
        if (alertsToDelete.length > 0) {
            const deleteNotificationsResult = await prisma.stockAlertNotification.deleteMany({
                where: {
                    alert_id: {
                        in: alertsToDelete.map(alert => alert.id)
                    }
                }
            });
            
            console.log(`✅ ${deleteNotificationsResult.count} notifications d'alerte supprimées.`);
            
            // Supprimer les alertes obsolètes
            const deleteResult = await prisma.stockAlert.deleteMany({
                where: {
                    id: {
                        in: alertsToDelete.map(alert => alert.id)
                    }
                }
            });
            
            console.log(`✅ ${deleteResult.count} alertes obsolètes supprimées.`);
        }
    } catch (error) {
        console.error('❌ Erreur lors du nettoyage des alertes:', error);
    }
    
    // Fermer proprement les connexions
    await queueService.close();
    await prisma.$disconnect();
    process.exit(0);
}

main()
    .catch((e) => {
        console.error('❌ Erreur lors du nettoyage des files d\'attente:', e);
        process.exit(1);
    })
    .finally(async () => {
        await queueService.close();
        await prisma.$disconnect();
    }); 