import { PrismaClient } from '@prisma/client';
import { QueueService } from '../services/QueueService';
import { PrismaService } from '../services/PrismaService';

// URL RabbitMQ pour le script
const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';

async function main() {
    // Initialiser les connexions
    const queueService = QueueService.getInstance();
    await queueService.connect();
    console.log('🔌 Connexion à RabbitMQ établie');

    const prismaService = new PrismaService();
    const prisma = prismaService.client;

    // Purger toutes les files d'attente pour éviter l'accumulation de messages
    await queueService.purgeAllQueues();
    console.log('🧹 Files d\'attente RabbitMQ purgées');

    try {
        // Récupérer toutes les commandes en statut PENDING
        console.log('🔍 Récupération des commandes en statut PENDING...');
        
        const pendingOrders = await prisma.order.findMany({
            where: {
                status: "PENDING"
            },
            include: {
                items: {
                    include: {
                        product: true
                    }
                },
                user: true
            }
        });
        
        if (pendingOrders.length === 0) {
            console.log('❌ Aucune commande en statut PENDING trouvée dans la base de données.');
            return;
        }
        
        console.log(`📊 ${pendingOrders.length} commandes en statut PENDING trouvées.`);
        
        // Afficher les détails des commandes trouvées
        console.log('\n📋 Détails des commandes PENDING:');
        
        for (let i = 0; i < pendingOrders.length; i++) {
            const order = pendingOrders[i];
            console.log(`\n  - Commande ${i+1}:`);
            console.log(`    • ID: ${order.id}`);
            console.log(`    • Statut: ${order.status}`);
            console.log(`    • Utilisateur: ${order.userId} (${order.user?.email || 'Email non disponible'})`);
            console.log(`    • Date de création: ${order.createdAt}`);
            console.log(`    • Produits:`);
            
            for (const item of order.items) {
                console.log(`      - ${item.product.name} (${item.quantity} unité(s) à ${item.price}€)`);
            }
        }
        
        // Ajouter chaque commande PENDING à la file d'attente RabbitMQ
        console.log('\n📤 Ajout des commandes à la file d\'attente RabbitMQ...');
        let addedToQueue = 0;
        
        for (const order of pendingOrders) {
            const hasQueuableProducts = order.items.some(item => item.product.is_queuable);
            
            await queueService.addToQueue({
                type: 'STOCK_VERIFICATION',
                data: {
                    orderId: order.id,
                    hasQueuableProducts: hasQueuableProducts,
                    reason: hasQueuableProducts ? undefined : "Commande en statut PENDING sans produits queuables",
                    items: order.items.map(item => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        isQueuable: item.product.is_queuable
                    }))
                }
            });
            
            console.log(`  ✓ Commande ${order.id} ajoutée à la file d'attente`);
            addedToQueue++;
        }
        
        console.log(`\n✅ ${addedToQueue} commandes PENDING ajoutées à la file d'attente RabbitMQ.`);
        
        // Note: Pour vérifier le nombre exact de messages dans la file d'attente,
        // il faudrait ajouter une méthode publique dans QueueService
        
    } catch (error) {
        console.error('❌ Erreur:', error);
    } finally {
        // Fermer proprement les connexions
        await queueService.close();
        await prisma.$disconnect();
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    }); 