# Workflow de gestion des stocks

## Problème actuel

Lorsqu'un utilisateur tente de créer une commande pour un produit en rupture de stock, une erreur est générée mais l'expérience utilisateur n'est pas optimale. De plus, les transactions de stock ne sont pas enregistrées correctement.

## Solution proposée

1. **Amélioration des notifications** : Afficher un toast clair indiquant le produit en rupture de stock, le stock disponible et la quantité demandée.

2. **Utilisation de StockTransaction** : Enregistrer toutes les modifications de stock dans la table StockTransaction pour assurer une traçabilité complète.

3. **Workflow de gestion des stocks** :
   - Lors de la création d'une commande, vérifier la disponibilité des stocks
   - Si le stock est insuffisant, afficher une notification claire
   - Si le stock est suffisant, créer la commande et mettre à jour les stocks
   - Enregistrer une transaction de stock pour chaque modification
   - Générer des alertes si le stock devient bas

4. **Gestion des produits queuables** :
   - Les produits marqués comme 'queuable' peuvent être commandés même si le stock est insuffisant
   - La commande reste en statut PENDING jusqu'à ce que le stock soit disponible
   - Une alerte est générée pour informer l'administrateur

## Implémentation

1. **StockTransactionService** : Service pour enregistrer toutes les transactions de stock
2. **StockService** : Service centralisé pour gérer les stocks
3. **OrderService** : Utilise StockService pour vérifier et mettre à jour les stocks
4. **Frontend** : Affiche des notifications claires en cas de rupture de stock

## Améliorations futures

1. **Réservation temporaire de stock** : Réserver le stock pendant un certain temps lors de l'ajout au panier
2. **Notifications en temps réel** : Informer les utilisateurs si un produit devient disponible
3. **Suggestions de produits alternatifs** : Proposer des alternatives en cas de rupture de stock
4. **Précommandes** : Permettre aux utilisateurs de précommander des produits en rupture de stock
