#!/bin/bash

# Fonction pour afficher l'aide
show_help() {
    echo "Usage: ./start.sh [dev|prod] [options]"
    echo ""
    echo "Options:"
    echo "  dev   - Démarre l'environnement de développement"
    echo "  prod  - Démarre l'environnement de production"
    echo ""
    echo "Exemples:"
    echo "  ./start.sh dev"
    echo "  ./start.sh prod"
}

# Vérifier si un argument a été fourni
if [ $# -eq 0 ]; then
    show_help
    exit 1
fi

# Traiter les arguments
case "$1" in
    dev)
        echo "🚀 Démarrage de l'environnement de développement..."
        docker compose -f compose.dev.yml up -d --build
        
        # Attendre que les services soient prêts
        echo "⏳ Attente du démarrage des services..."
        sleep 5
        
        # Purger les files d'attente RabbitMQ
        echo "🧹 Purge des files d'attente RabbitMQ..."
        docker compose -f compose.dev.yml exec api node -e "const { QueueService } = require('./dist/services/QueueService'); const queueService = QueueService.getInstance(); (async () => { await queueService.connect(); await queueService.purgeAllQueues(); })().catch(console.error);"
        
        echo "✅ Environnement de développement prêt!"

        exit 1
        ;;
    prod)
        echo "🚀 Démarrage de l'environnement de production..."
        if [ ! -f .env.production ]; then
            echo "❌ Erreur: Le fichier .env.production n'existe pas"
            exit 1
        fi
        export $(cat .env.production | xargs)
        docker compose -f compose.prod.yml up -d --build
        ;;
    *)
        show_help
        exit 1
        ;;
esac 