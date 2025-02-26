import { Router } from 'express';
import { ProductController } from '../controllers/product.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();
const productController = new ProductController();

// Récupérer tous les produits (accessible à tous les utilisateurs authentifiés)
router.get('/', productController.getAllProducts.bind(productController));

// Récupérer un produit par ID (accessible à tous les utilisateurs authentifiés)
router.get('/:id', productController.getProductById.bind(productController));

// Créer un nouveau produit (réservé aux admins)
router.post('/', authorize(['ADMIN']), productController.createProduct.bind(productController));

// Mettre à jour un produit (réservé aux admins)
router.put('/:id', authorize(['ADMIN']), productController.updateProduct.bind(productController));

// Supprimer un produit (réservé aux admins)
router.delete('/:id', authorize(['ADMIN']), productController.deleteProduct.bind(productController));

export default router; 