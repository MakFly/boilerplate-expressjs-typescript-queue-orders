import { PrismaClient, StockAlertType } from '@prisma/client';
import { OrderService } from '../services/OrderService';
import { QueueService } from '../services/QueueService';
import { PrismaService } from '../services/PrismaService';
import { StockAlertService } from '../services/stocks/StockAlertService';
import { StockService } from '../services/stocks/StockService';
import { StockRepository } from '../repositories/StockRepository';

// Définir l'URL de RabbitMQ pour le script de seed
process.env.RABBITMQ_URL = 'amqp://guest:guest@rabbitmq:5672';

// Utiliser le client Prisma directement
const prisma = new PrismaClient();

const prismaService = new PrismaService();
const queueService = QueueService.getInstance();
const stockRepository = new StockRepository(prismaService);
const stockAlertService = new StockAlertService(prismaService);
const stockService = new StockService(stockRepository, prismaService, stockAlertService);
const orderService = new OrderService();

async function main() {
    // Initialiser la connexion RabbitMQ
    await queueService.connect();
    console.log('🔌 Tentative de connexion à RabbitMQ...');

    // Purger les files d'attente
    await queueService.purgeAllQueues();
    console.log('🧹 Files d\'attente RabbitMQ purgées');

    console.log('🗑️ Nettoyage de la base de données...');
    await prisma.$transaction(async (tx) => {
        await tx.stockAlertNotification.deleteMany();
        await tx.stockAlert.deleteMany();
        await tx.orderItem.deleteMany();
        await tx.order.deleteMany();
        await tx.product.deleteMany();
        await tx.user.deleteMany();
    });

    console.log('👤 Création des utilisateurs...');

    const userRole = "USER";
    const adminRole = "ADMIN";

    const user = await prisma.user.create({
        data: {
            email: 'user@example.com',
            name: 'Utilisateur Standard',
            role: userRole
        }
    });

    const admin = await prisma.user.create({
        data: {
            email: 'admin@example.com',
            name: 'Administrateur',
            role: adminRole
        }
    });

    console.log('📦 Création des produits...');
    const products = await prisma.$transaction(async (tx) => {
        // 1. Produits avec stock normal
        const laptop = await tx.product.create({
            data: {
                name: 'Laptop Pro 2024',
                price: 1299.99,
                stock: 50,
                is_queuable: false
            }
        });

        const smartphone = await tx.product.create({
            data: {
                name: 'Smartphone X15',
                price: 899.99,
                stock: 100,
                is_queuable: false
            }
        });

        // 2. Produit avec stock limité
        const earbuds = await tx.product.create({
            data: {
                name: 'Écouteurs Sans Fil Pro',
                price: 199.99,
                stock: 8,
                is_queuable: true
            }
        });

        // 3. Produit avec stock très limité
        const console = await tx.product.create({
            data: {
                name: 'Console de Jeu Limited Edition',
                price: 499.99,
                stock: 2,
                is_queuable: true
            }
        });

        // 4. Produit en rupture de stock
        const collector = await tx.product.create({
            data: {
                name: 'Collector Edition 2024',
                price: 299.99,
                stock: 0,
                is_queuable: true
            }
        });

        return [laptop, smartphone, earbuds, console, collector];
    });

    console.log('🚨 Création des alertes de stock...');
    
    // Créer des alertes de stock et envoyer des notifications
    const lowStockAlertId = await stockAlertService.createAlert({
        type: StockAlertType.LOW_STOCK,
        productId: products[2].id,
        quantity: 8,
        severity: 'MEDIUM',
        message: "Stock bas - Réapprovisionnement recommandé",
        metadata: {
            threshold: 10,
            message: "Stock bas - Réapprovisionnement recommandé"
        }
    });
    console.log(`✓ Alerte de stock bas créée pour ${products[2].name} (ID: ${lowStockAlertId})`);
    
    const criticalStockAlertId = await stockAlertService.createAlert({
        type: StockAlertType.LOW_STOCK,
        productId: products[3].id,
        quantity: 2,
        severity: 'HIGH',
        message: "Stock critique - Réapprovisionnement urgent",
        metadata: {
            threshold: 5,
            message: "Stock critique - Réapprovisionnement urgent"
        }
    });
    console.log(`✓ Alerte de stock critique créée pour ${products[3].name} (ID: ${criticalStockAlertId})`);
    
    const stockOutAlertId = await stockAlertService.createAlert({
        type: StockAlertType.STOCK_OUT,
        productId: products[4].id,
        quantity: 0,
        severity: 'CRITICAL',
        message: "Rupture de stock - Réapprovisionnement requis",
        metadata: {
            message: "Rupture de stock - Réapprovisionnement requis"
        }
    });
    console.log(`✓ Alerte de rupture de stock créée pour ${products[4].name} (ID: ${stockOutAlertId})`);

    // Attendre que les notifications soient traitées
    console.log('⏳ Attente du traitement des notifications...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('📋 Création des commandes de test...');
    try {
        // 1. Commande avec des produits disponibles (non queuables)
        const orderResponse1 = await orderService.createOrder({
            userId: user.id,
            items: [
                { productId: products[0].id, quantity: 1 },
                { productId: products[1].id, quantity: 1 }
            ],
            status: "PENDING"
        });
        console.log('✓ Commande 1 créée (produits non queuables)');
        
        // Ajouter à la queue RabbitMQ même si les produits ne sont pas queuables
        // car le statut a été forcé à PENDING
        if (orderResponse1.order) {
            await queueService.addToQueue({
                type: 'STOCK_VERIFICATION',
                data: {
                    orderId: orderResponse1.order.id,
                    hasQueuableProducts: false,
                    reason: "Commande de test en statut PENDING",
                    items: orderResponse1.order.items.map(item => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        isQueuable: item.product.is_queuable
                    }))
                }
            });
            console.log('✓ Commande 1 ajoutée à la queue (produits non queuables mais statut PENDING)');
        }

        // 2. Commande avec stock limité (queuable)
        const orderResponse2 = await orderService.createOrder({
            userId: user.id,
            items: [
                { productId: products[2].id, quantity: 3 }
            ],
            status: "PENDING"
        });
        
        // Ajouter à la queue RabbitMQ si le produit est queuable
        if (orderResponse2.order) {
            await queueService.addToQueue({
                type: 'STOCK_VERIFICATION',
                data: {
                    orderId: orderResponse2.order.id,
                    hasQueuableProducts: orderResponse2.order.items.some(item => item.product.is_queuable),
                    items: orderResponse2.order.items.map(item => ({
                        productId: item.productId,
                        quantity: item.quantity,
                        isQueuable: item.product.is_queuable
                    }))
                }
            });
            console.log('✓ Commande 2 ajoutée à la queue (produit queuable)');
            
            // Créer une alerte pour la commande en file d'attente
            await stockAlertService.createQueuedOrderAlert(
                products[2].id,
                3,
                orderResponse2.order.id
            );
            console.log('✓ Alerte de commande en file d\'attente créée');
        }

        // 3. Tentative de commande avec stock insuffisant (queuable)
        try {
            await orderService.createOrder({
                userId: admin.id,
                items: [
                    { productId: products[4].id, quantity: 1 }
                ],
                status: "PENDING"
            });
        } catch (error) {
            console.log('✓ Test de commande avec stock insuffisant réussi');
            // Créer une alerte FAILED_ORDER
            const failedOrderAlertId = await stockAlertService.createFailedOrderAlert(
                products[4].id,
                1,
                "Stock insuffisant",
                { orderId: undefined }
            );
            console.log(`✓ Alerte d'échec de commande créée (ID: ${failedOrderAlertId})`);
        }

    } catch (error) {
        console.error('Erreur lors de la création des commandes:', error);
    }

    // Attendre que toutes les notifications soient traitées
    console.log('⏳ Attente du traitement final des notifications...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Afficher le résumé final
    const [productCount, alertCount, notificationCount, orderCount] = await prisma.$transaction([
        prisma.product.count(),
        prisma.stockAlert.count(),
        prisma.stockAlertNotification.count(),
        prisma.order.count()
    ]);

    console.log('\n✅ Base de données initialisée avec succès !');
    console.log('📊 Résumé final :');
    console.log(`  - ${productCount} produits créés`);
    console.log(`  - ${alertCount} alertes de stock créées`);
    console.log(`  - ${notificationCount} notifications d'alerte créées`);
    console.log(`  - ${orderCount} commandes créées`);
    
    console.log('\n🔍 État final des stocks et alertes :');
    const finalProducts = await prisma.product.findMany({
        include: {
            stockAlerts: true,
            orderItems: true
        }
    });

    for (const p of finalProducts) {
        console.log(`\n  - ${p.name}:`);
        console.log(`    • ${p.stock} en stock`);
        console.log(`    • ${p.is_queuable ? 'Queuable' : 'Non queuable'}`);
        console.log(`    • Prix: ${p.price}€`);
        console.log(`    • ${p.orderItems.length} commande(s)`);
        console.log(`    • ${p.stockAlerts.length} alerte(s) de stock`);
        p.stockAlerts.forEach(alert => {
            console.log(`      - Type: ${alert.type}, Quantité: ${alert.quantity}`);
        });
    }

    // Afficher les notifications créées
    console.log('\n📢 Notifications créées :');
    const notifications = await prisma.stockAlertNotification.findMany({
        orderBy: { timestamp: 'desc' },
        include: {
            alert: {
                include: {
                    product: true
                }
            }
        }
    });
    
    for (const n of notifications) {
        console.log(`  - [${n.severity}] ${n.message} (${n.alert.product.name})`);
    }

    // Fermer proprement les connexions
    await queueService.close();
    await prisma.$disconnect();
    process.exit(0);
}

main()
    .catch((e) => {
        console.error('❌ Erreur lors du seeding:', e);
        process.exit(1);
    })
    .finally(async () => {
        await queueService.close();
        await prisma.$disconnect();
    });