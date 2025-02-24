# Express TypeScript Boilerplate avec File d'Attente

Ce projet est un boilerplate Express.js en TypeScript intégrant un système de file d'attente asynchrone avec RabbitMQ et Redis pour la gestion des commandes à fort trafic.

## 🚀 Fonctionnalités

- Gestion asynchrone des commandes avec RabbitMQ
- Cache avec Redis
- Base de données PostgreSQL avec Prisma
- Interface d'administration avec Adminer
- Monitoring des logs avec Dozzle
- Reverse proxy avec Caddy

## 📋 Prérequis

- Docker et Docker Compose
- Node.js >= 16
- npm ou pnpm

## 🛠 Installation

1. Cloner le repository :
```bash
git clone [votre-repo]
cd express-typescript-boilerplate
```

2. Installer les dépendances :
```bash
npm install
# ou
pnpm install
```

3. Copier le fichier d'environnement :
```bash
cp .env.example .env
```

4. Lancer l'environnement Docker :
```bash
docker-compose up -d
```

## 🔄 Architecture du Système de File d'Attente

Le système utilise trois services principaux :

### 1. OrderService
- Gère la logique métier des commandes
- Décide si une commande doit être mise en file d'attente
- Limite à ${MAX_CONCURRENT_ORDERS} commandes simultanées

### 2. QueueService (RabbitMQ)
- Gère la file d'attente des commandes
- Assure la persistance des messages
- Gère les reprises en cas d'échec

### 3. CacheService (Redis)
- Stocke les données temporaires
- Gère les compteurs de commandes actives
- Optimise les performances

## 📊 Monitoring

### Logs Docker
Pour suivre les logs en temps réel :
```bash
# Tous les services
docker-compose logs -f

# Service spécifique
docker-compose logs -f api
docker-compose logs -f rabbitmq
docker-compose logs -f redis
```

### Interfaces Web
- RabbitMQ Management : http://localhost:15672 (user/password)
- Adminer (DB) : http://localhost:9080
- Dozzle (Logs) : http://localhost:8888

## 🧪 Test du Système

1. Lancer le seeder :
```bash
npm run seed
# ou
pnpm run seed
```

2. Vérifier dans l'interface RabbitMQ :
- Accéder à http://localhost:15672
- Voir les messages dans la queue "orders_queue"

## 📝 Endpoints API

- `POST /api/orders` : Créer une nouvelle commande
- `GET /api/orders` : Lister toutes les commandes
- `GET /api/orders/:id` : Détails d'une commande
- `PUT /api/orders/:id/status` : Mettre à jour le statut
- `DELETE /api/orders/:id` : Supprimer une commande

## 🔍 Surveillance des Files d'Attente

1. **Interface RabbitMQ** (http://localhost:15672)
   - Voir le nombre de messages en attente
   - Surveiller la consommation
   - Gérer les files d'attente

2. **Logs avec Dozzle** (http://localhost:8888)
   - Voir les logs en temps réel
   - Filtrer par service
   - Rechercher des événements spécifiques

## 📁 Structure du Projet

```
.
├── src/
│   ├── controllers/     # Contrôleurs de l'application
│   ├── middlewares/    # Middlewares personnalisés
│   ├── routes/         # Définition des routes
│   ├── auth/           # Authentification
│   ├── app.ts          # Configuration Express
│   └── server.ts       # Point d'entrée
├── tests/              # Tests
├── Dockerfile          # Configuration Docker
├── docker-compose.yml  # Configuration Docker Compose
└── tsconfig.json       # Configuration TypeScript
```

## 🔑 API Endpoints

### Utilisateurs

```
GET    /api/users      # Liste tous les utilisateurs
POST   /api/users      # Crée un nouvel utilisateur
GET    /api/users/:id  # Récupère un utilisateur par ID
PUT    /api/users/:id  # Met à jour un utilisateur
DELETE /api/users/:id  # Supprime un utilisateur
```

#### Exemple de requête POST /api/users

```json
{
  "email": "user@example.com",
  "name": "John Doe"
}
```

## 🔒 Sécurité

Le projet inclut plusieurs mesures de sécurité :

- **Helmet** - Protection contre les vulnérabilités web courantes
- **Rate Limiting** - Protection contre les attaques par force brute
- **CORS** - Configuration sécurisée des Cross-Origin Resource Sharing
- **Validation** - Validation des entrées utilisateur

## 📚 Documentation API

La documentation Swagger est disponible à l'adresse :
```
http://localhost:3000/api-docs
```

## 🧪 Tests

```bash
# Exécuter les tests
pnpm test

# Exécuter les tests avec couverture
pnpm test:coverage
```

## 🤝 Contribution

1. Fork le projet
2. Créer une branche (`git checkout -b feature/amazing-feature`)
3. Commit les changements (`git commit -m 'feat: add amazing feature'`)
4. Push sur la branche (`git push origin feature/amazing-feature`)
5. Ouvrir une Pull Request

## 📝 License

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 🆘 Support

Pour toute question ou problème, veuillez ouvrir une issue dans le repository GitHub. 