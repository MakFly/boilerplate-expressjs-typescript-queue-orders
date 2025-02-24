# Gestion des Stocks

## Problématique
- Besoin d'empêcher les stocks négatifs
- Nécessité de tracer les tentatives de commande avec stock insuffisant
- Besoin d'alerter quand le stock est bas

## Solution : Table StockAlert

Cette table permet de :
1. Tracer les tentatives de commande avec stock insuffisant
2. Gérer les alertes de stock bas
3. Aider à la décision pour le réapprovisionnement

### Structure
```sql
CREATE TABLE stock_alerts (
    id          UUID PRIMARY KEY,
    product_id  UUID NOT NULL,
    type        VARCHAR(50) NOT NULL, -- LOW_STOCK, STOCK_OUT, FAILED_ORDER
    quantity    INT NOT NULL,         -- Quantité demandée ou seuil atteint
    created_at  TIMESTAMP NOT NULL,
    order_id    UUID,                 -- Optionnel, lié à la commande si type = FAILED_ORDER
    metadata    JSONB                 -- Données additionnelles (ex: seuil d'alerte)
);
```

### Types d'alertes
- `LOW_STOCK` : Stock en dessous du seuil minimal
- `STOCK_OUT` : Stock à zéro
- `FAILED_ORDER` : Commande impossible par manque de stock

### Seuils et Notifications
- Seuil configurable par produit
- Notifications automatiques aux gestionnaires
- Statistiques pour optimisation des stocks 