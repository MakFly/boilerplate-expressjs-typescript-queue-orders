# Système de Gestion des Stocks et Alertes

## Problématique
- Empêcher les stocks négatifs
- Tracer les tentatives de commande avec stock insuffisant
- Alerter quand le stock est bas
- Permettre la mise en file d'attente des commandes pour les produits éligibles
- Fournir une surveillance en temps réel des alertes de stock

## Solution : Service Centralisé d'Alertes de Stock

Le système repose sur deux composants principaux :
1. Une table `StockAlert` pour stocker les alertes
2. Un service `StockAlertService` qui centralise toute la logique d'alertes

### Structure de la Table StockAlert

```sql
CREATE TABLE stock_alerts (
    id          UUID PRIMARY KEY,
    product_id  UUID NOT NULL,
    type        VARCHAR(50) NOT NULL, -- LOW_STOCK, STOCK_OUT, FAILED_ORDER, QUEUED_ORDER, PROCESSED
    quantity    INT NOT NULL,         -- Quantité demandée ou seuil atteint
    created_at  TIMESTAMP NOT NULL,
    order_id    UUID,                 -- Optionnel, lié à la commande
    metadata    JSONB                 -- Données additionnelles (ex: seuil d'alerte, position dans la file)
);
```

### Types d'Alertes

- `LOW_STOCK` : Stock en dessous du seuil minimal
- `STOCK_OUT` : Stock à zéro
- `FAILED_ORDER` : Commande impossible par manque de stock
- `QUEUED_ORDER` : Commande mise en file d'attente (produit éligible)
- `PROCESSED` : Commande en file d'attente traitée

### Métadonnées Standardisées

Les métadonnées sont structurées selon le type d'alerte :

```typescript
interface StockAlertMetadata {
    // Métadonnées communes
    timestamp: string;
    message?: string;
    read?: boolean;
    readAt?: string;
    
    // Métadonnées spécifiques aux alertes de stock bas
    threshold?: number;
    currentStock?: number;
    previousStock?: number;
    
    // Métadonnées spécifiques aux commandes en file d'attente
    queuePosition?: number;
    queuedAt?: string;
    estimatedProcessingTime?: string;
    
    // Métadonnées spécifiques aux commandes traitées
    processedAt?: string;
    processedBy?: string;
    validationType?: 'MANUAL' | 'AUTOMATIC';
    
    // Métadonnées spécifiques aux échecs de commande
    reason?: string;
    requestedQuantity?: number;
    availableStock?: number;
}
```

## Architecture du Système d'Alertes

### StockAlertService

Service centralisé qui :
- Crée et gère les alertes
- Vérifie les seuils de stock bas
- Gère les commandes en file d'attente
- Envoie des notifications en temps réel
- Fournit des statistiques sur les alertes

### Notifications en Temps Réel

Le système utilise :
- RabbitMQ pour la distribution des notifications
- WebSockets pour la diffusion en temps réel aux clients
- Un système de sévérité (LOW, MEDIUM, HIGH, CRITICAL) pour prioriser les alertes

### Intégration avec le Frontend

Les alertes sont accessibles via :
- Une API REST pour les requêtes standard
- Une connexion WebSocket pour les mises à jour en temps réel
- Un tableau de bord dédié pour visualiser les alertes critiques

## Surveillance et Monitoring

### Statistiques d'Alertes

Le système fournit des statistiques sur :
- Nombre total d'alertes
- Répartition par type d'alerte
- Répartition par produit
- Alertes récentes (24h)
- Alertes non lues

### Logs en Temps Réel

Les logs du système sont :
- Centralisés via Winston
- Diffusés en temps réel via WebSocket
- Filtrables par niveau (error, warn, info, debug)
- Horodatés pour faciliter le suivi

## Gestion des Files d'Attente

### Commandes en File d'Attente

Pour les produits éligibles (is_queuable = true) :
1. Les commandes sont mises en file d'attente lorsque le stock est insuffisant
2. Une position dans la file est attribuée et mise à jour automatiquement
3. Les commandes peuvent être traitées automatiquement ou manuellement
4. Des notifications sont envoyées lors du traitement

### Traitement des Commandes

Le traitement peut être :
- Automatique : lorsque le stock est réapprovisionné
- Manuel : via l'API ou l'interface d'administration
- Priorisé : selon des règles métier configurables

## Intégration avec les Autres Services

Le système d'alertes s'intègre avec :
- `StockService` : pour vérifier et mettre à jour les stocks
- `OrderService` : pour gérer les commandes et leur statut
- `QueueService` : pour la distribution des messages
- `StockVerificationWorker` : pour le traitement asynchrone des vérifications 