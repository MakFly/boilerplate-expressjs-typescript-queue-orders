# Express.js Development Guidelines

## Architecture and Project Structure

```
src/
  ├── controllers/     # Gestion des requêtes HTTP et réponses
  ├── services/       # Logique métier
  ├── repositories/   # Abstraction de la couche de données
  ├── middlewares/    # Middleware Express
  ├── routes/         # Définition des routes
  ├── types/          # Types TypeScript et DTOs
  ├── config/         # Configuration de l'application
  ├── utils/          # Utilitaires et helpers
  └── tests/          # Tests unitaires et d'intégration
```

## Principes Architecturaux

### Types et DTOs
- Utiliser le dossier `types/` pour définir :
  - Les interfaces et types TypeScript
  - Les DTOs (Data Transfer Objects)
  - Les types d'entrée/sortie des services
  - Les interfaces de validation

### Services
- Contiennent toute la logique métier
- Définir une interface pour chaque service
- Implémenter les services de manière testable
- Utiliser l'injection de dépendances par constructeur

### Controllers
- Responsables uniquement de :
  - La validation des entrées
  - L'appel aux services appropriés
  - La transformation des réponses
  - La gestion des erreurs HTTP

### Tests
- Tests unitaires pour les services
- Tests d'intégration pour les controllers
- Mocks pour les dépendances externes
- Coverage minimum requis : 80%

## Bonnes Pratiques

### Validation
- Utiliser Joi ou express-validator pour la validation des entrées
- Valider les données au niveau du controller
- Transformer les données en DTOs appropriés

### Gestion des Erreurs
- Utiliser des classes d'erreur personnalisées
- Centraliser la gestion des erreurs
- Logger les erreurs de manière appropriée
- Retourner des réponses d'erreur cohérentes

### Sécurité
- Implémenter la validation des entrées
- Utiliser les headers de sécurité appropriés
- Gérer correctement les sessions/JWT
- Sanitizer les entrées utilisateur

### Performance
- Utiliser le caching quand approprié
- Optimiser les requêtes de base de données
- Implémenter la pagination
- Utiliser la compression des réponses

### Documentation
- Documenter les APIs avec Swagger/OpenAPI
- Maintenir une documentation de configuration
- Documenter les processus de déploiement
- Documenter les décisions d'architecture