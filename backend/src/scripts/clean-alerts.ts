import { PrismaClient } from '@prisma/client';
import { StockAlertService } from '../services/stocks/StockAlertService';
import { PrismaService } from '../services/PrismaService';
import logger from '../utils/logger';

const prisma = new PrismaClient();
const prismaService = new PrismaService();
const stockAlertService = new StockAlertService(prismaService);

async function main() {
    console.log('🔍 Recherche des alertes de commandes en attente...');
    
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
    
    // Supprimer les alertes obsolètes
    if (alertsToDelete.length > 0) {
        // D'abord, supprimer les notifications associées aux alertes
        console.log('🧹 Suppression des notifications associées aux alertes obsolètes...');
        
        const deleteNotificationsResult = await prisma.stockAlertNotification.deleteMany({
            where: {
                alert_id: {
                    in: alertsToDelete.map(alert => alert.id)
                }
            }
        });
        
        console.log(`✅ ${deleteNotificationsResult.count} notifications d'alerte supprimées.`);
        
        // Ensuite, supprimer les alertes
        const deleteResult = await prisma.stockAlert.deleteMany({
            where: {
                id: {
                    in: alertsToDelete.map(alert => alert.id)
                }
            }
        });
        
        console.log(`✅ ${deleteResult.count} alertes obsolètes supprimées.`);
    }
    
    // Afficher les alertes restantes
    if (alertsToKeep.length > 0) {
        console.log('\n📋 Alertes restantes:');
        
        for (const alert of alertsToKeep) {
            console.log(`  • Alerte ${alert.id} pour la commande ${alert.order_id} (statut: ${alert.order?.status})`);
        }
    }
    
    // Fermer proprement les connexions
    await prisma.$disconnect();
    process.exit(0);
}

main()
    .catch((e) => {
        console.error('❌ Erreur lors du nettoyage des alertes:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    }); 