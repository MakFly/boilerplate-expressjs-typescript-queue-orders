# Express TypeScript Boilerplate avec Système de File d'Attente

Un boilerplate Express.js en TypeScript robuste avec gestion de file d'attente asynchrone, alertes de stock en temps réel et capacités de surveillance complètes.

## Fonctionnalités Principales

- **Traitement asynchrone des commandes** avec RabbitMQ
- **Alertes et surveillance des stocks en temps réel**
- **Intégration WebSocket** pour logs et notifications en direct
- **Base de données PostgreSQL** avec ORM Prisma
- **Cache Redis** pour l'optimisation des performances
- **Documentation API complète** avec Swagger
- **Tests automatisés** avec Jest
- **Système de workers** pour le traitement en arrière-plan
- **Gestion des erreurs centralisée**
- **Logging avancé** avec Winston

## Prérequis

- **Docker** et **Docker Compose** (v2.0+)
- **Node.js** (v16.0+)
- **npm** (v7.0+) ou **pnpm** (v6.0+)
- **Git**

## Démarrage Rapide

```bash
# Cloner le dépôt
git clone [votre-repo]
cd express-typescript-boilerplate/backend

# Installer les dépendances
npm install
# ou
pnpm install

# Configurer l'environnement
cp .env.development .env

# Démarrer l'environnement de développement
docker-compose -f compose.dev.yml up -d
npm run dev
```

## Scripts Disponibles

```bash
# Démarrer le serveur en mode production
npm start

# Démarrer le serveur en mode développement
npm run dev

# Compiler le projet
npm run build

# Lancer les tests
npm test

# Lancer les tests avec surveillance
npm run test:watch

# Générer les types Prisma
npm run prisma:generate

# Exécuter les migrations Prisma
npm run prisma:migrate

# Démarrer Prisma Studio
npm run prisma:studio

# Démarrer le worker de vérification des stocks
npm run worker:stock

# Démarrer tous les workers
npm run workers

# Alimenter la base de données avec des données de test
npm run seed

# Mettre en file d'attente les commandes en attente
npm run queue-pending-orders

# Nettoyer les files d'attente
npm run clean-queues
```

## Structure du Projet

```
backend/
├── dist/               # Code compilé
├── docs/               # Documentation détaillée
├── logs/               # Fichiers de logs
├── node_modules/       # Dépendances
├── prisma/             # Schéma et migrations Prisma
├── src/
│   ├── auth/           # Authentification et autorisation
│   ├── config/         # Configuration de l'application
│   ├── controllers/    # Contrôleurs HTTP
│   ├── dto/            # Objets de transfert de données
│   ├── middleware/     # Middleware Express
│   ├── repositories/   # Couche d'accès aux données
│   ├── routes/         # Routes API
│   ├── scripts/        # Scripts utilitaires
│   ├── services/       # Logique métier
│   ├── types/          # Types TypeScript
│   ├── utils/          # Fonctions utilitaires
│   ├── workers/        # Workers pour traitement asynchrone
│   ├── app.ts          # Configuration Express
│   ├── config.ts       # Configuration globale
│   └── server.ts       # Point d'entrée de l'application
├── tests/              # Tests unitaires et d'intégration
├── .env                # Variables d'environnement
├── .env.development    # Variables d'environnement pour le développement
├── .env.production     # Variables d'environnement pour la production
├── compose.dev.yml     # Configuration Docker Compose pour le développement
├── compose.prod.yml    # Configuration Docker Compose pour la production
├── Dockerfile          # Configuration Docker
├── jest.config.js      # Configuration Jest
├── package.json        # Dépendances et scripts npm
├── tsconfig.json       # Configuration TypeScript
└── README.md           # Ce fichier
```

## Documentation

Pour une documentation détaillée, veuillez consulter le répertoire [/docs](/docs) :

- [Guide d'Installation](/docs/INSTALLATION.md)
- [Vue d'Ensemble de l'Architecture](/docs/ARCHITECTURE.md)
- [Référence API](/docs/API.md)
- [Système de Gestion des Stocks](/docs/STOCK_MANAGEMENT.md)
- [Surveillance en Temps Réel](/docs/MONITORING.md)
- [Intégration Frontend](/docs/FRONTEND_INTEGRATION.md)

## Déploiement

Pour déployer en production :

```bash
# Configurer l'environnement de production
cp .env.production .env

# Compiler le projet
npm run build

# Démarrer les services avec Docker Compose
docker-compose -f compose.prod.yml up -d
```

## Licence

Ce projet est sous licence MIT - voir le fichier LICENSE pour plus de détails.

---

# Express TypeScript Boilerplate with Queue System

A robust Express.js TypeScript boilerplate with asynchronous queue management, real-time stock alerts, and comprehensive monitoring capabilities.

## Key Features

- **Asynchronous order processing** with RabbitMQ
- **Real-time stock alerts and monitoring**
- **WebSocket integration** for live logs and notifications
- **PostgreSQL database** with Prisma ORM
- **Redis caching** for performance optimization
- **Comprehensive API documentation** with Swagger
- **Automated testing** with Jest
- **Worker system** for background processing
- **Centralized error handling**
- **Advanced logging** with Winston

## Prerequisites

- **Docker** and **Docker Compose** (v2.0+)
- **Node.js** (v16.0+)
- **npm** (v7.0+) or **pnpm** (v6.0+)
- **Git**

## Quick Start

```bash
# Clone the repository
git clone [your-repo]
cd express-typescript-boilerplate/backend

# Install dependencies
npm install
# or
pnpm install

# Configure environment
cp .env.development .env

# Start development environment
docker-compose -f compose.dev.yml up -d
npm run dev
```

## Available Scripts

```bash
# Start the server in production mode
npm start

# Start the server in development mode
npm run dev

# Build the project
npm run build

# Run tests
npm test

# Run tests with watch mode
npm run test:watch

# Generate Prisma types
npm run prisma:generate

# Run Prisma migrations
npm run prisma:migrate

# Start Prisma Studio
npm run prisma:studio

# Start stock verification worker
npm run worker:stock

# Start all workers
npm run workers

# Seed the database with test data
npm run seed

# Queue pending orders
npm run queue-pending-orders

# Clean queues
npm run clean-queues
```

## Project Structure

```
backend/
├── dist/               # Compiled code
├── docs/               # Detailed documentation
├── logs/               # Log files
├── node_modules/       # Dependencies
├── prisma/             # Prisma schema and migrations
├── src/
│   ├── auth/           # Authentication and authorization
│   ├── config/         # Application configuration
│   ├── controllers/    # HTTP controllers
│   ├── dto/            # Data transfer objects
│   ├── middleware/     # Express middleware
│   ├── repositories/   # Data access layer
│   ├── routes/         # API routes
│   ├── scripts/        # Utility scripts
│   ├── services/       # Business logic
│   ├── types/          # TypeScript types
│   ├── utils/          # Utility functions
│   ├── workers/        # Workers for asynchronous processing
│   ├── app.ts          # Express configuration
│   ├── config.ts       # Global configuration
│   └── server.ts       # Application entry point
├── tests/              # Unit and integration tests
├── .env                # Environment variables
├── .env.development    # Development environment variables
├── .env.production     # Production environment variables
├── compose.dev.yml     # Docker Compose configuration for development
├── compose.prod.yml    # Docker Compose configuration for production
├── Dockerfile          # Docker configuration
├── jest.config.js      # Jest configuration
├── package.json        # npm dependencies and scripts
├── tsconfig.json       # TypeScript configuration
└── README.md           # This file
```

## Documentation

For detailed documentation, please refer to the [/docs](/docs) directory:

- [Installation Guide](/docs/INSTALLATION.md)
- [Architecture Overview](/docs/ARCHITECTURE.md)
- [API Reference](/docs/API.md)
- [Stock Management System](/docs/STOCK_MANAGEMENT.md)
- [Real-time Monitoring](/docs/MONITORING.md)
- [Frontend Integration](/docs/FRONTEND_INTEGRATION.md)

## Deployment

To deploy in production:

```bash
# Configure production environment
cp .env.production .env

# Build the project
npm run build

# Start services with Docker Compose
docker-compose -f compose.prod.yml up -d
```

## License

This project is licensed under the MIT License - see the LICENSE file for details. 