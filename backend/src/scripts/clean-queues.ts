import { PrismaClient } from '@prisma/client';
import { QueueService } from '../services/QueueService';
import { PrismaService } from '../services/PrismaService';
import logger from '../utils/logger';

// Définir l'URL de RabbitMQ pour le script
process.env.RABBITMQ_URL = 'amqp://guest:guest@rabbitmq:5672';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const queueService = QueueService.getInstance();

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