import { PrismaClient, StockAlertType } from '@prisma/client';
import { OrderService } from '../services/OrderService';
import { StockService } from '../services/StockService';
import { QueueService } from '../services/QueueService';

const prisma = new PrismaClient();
const orderService = new OrderService();
const stockService = new StockService();
const queueService = QueueService.getInstance();

async function main() {
    // Initialiser la connexion RabbitMQ
    await queueService.connect();
    console.log('🔌 Tentative de connexion à RabbitMQ...');

    console.log('🗑️ Nettoyage de la base de données...');
    await prisma.$transaction(async (tx) => {
        await tx.stockAlert.deleteMany();
        await tx.orderItem.deleteMany();
        await tx.order.deleteMany();
        await tx.product.deleteMany();
        await tx.user.deleteMany();
    });

    console.log('👤 Création des utilisateurs...');
    const user = await prisma.user.create({
        data: {
            email: 'test@example.com',
            name: 'Utilisateur Test'
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
                is_queuable: true,
                stockAlerts: {
                    create: {
                        type: StockAlertType.LOW_STOCK,
                        quantity: 8,
                        metadata: {
                            threshold: 10,
                            message: "Stock bas - Réapprovisionnement recommandé"
                        }
                    }
                }
            }
        });

        // 3. Produit avec stock très limité
        const console = await tx.product.create({
            data: {
                name: 'Console de Jeu Limited Edition',
                price: 499.99,
                stock: 2,
                is_queuable: true,
                stockAlerts: {
                    create: {
                        type: StockAlertType.LOW_STOCK,
                        quantity: 2,
                        metadata: {
                            threshold: 5,
                            message: "Stock critique - Réapprovisionnement urgent"
                        }
                    }
                }
            }
        });

        // 4. Produit en rupture de stock
        const collector = await tx.product.create({
            data: {
                name: 'Collector Edition 2024',
                price: 299.99,
                stock: 0,
                is_queuable: true,
                stockAlerts: {
                    create: {
                        type: StockAlertType.STOCK_OUT,
                        quantity: 0,
                        metadata: {
                            message: "Rupture de stock - Réapprovisionnement requis"
                        }
                    }
                }
            }
        });

        return [laptop, smartphone, earbuds, console, collector];
    });

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
        }

        // 3. Tentative de commande avec stock insuffisant (queuable)
        try {
            await orderService.createOrder({
                userId: user.id,
                items: [
                    { productId: products[4].id, quantity: 1 }
                ],
                status: "PENDING"
            });
        } catch (error) {
            console.log('✓ Test de commande avec stock insuffisant réussi');
            // Créer une alerte FAILED_ORDER
            await prisma.stockAlert.create({
                data: {
                    type: StockAlertType.FAILED_ORDER,
                    quantity: 1,
                    product_id: products[4].id,
                    metadata: {
                        reason: "Stock insuffisant",
                        requestedQuantity: 1,
                        availableStock: 0
                    }
                }
            });
        }

    } catch (error) {
        console.error('Erreur lors de la création des commandes:', error);
    }

    // Afficher le résumé final
    const [productCount, alertCount, orderCount] = await prisma.$transaction([
        prisma.product.count(),
        prisma.stockAlert.count(),
        prisma.order.count()
    ]);

    console.log('\n✅ Base de données initialisée avec succès !');
    console.log('📊 Résumé final :');
    console.log(`  - ${productCount} produits créés`);
    console.log(`  - ${alertCount} alertes de stock créées`);
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