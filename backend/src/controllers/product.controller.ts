import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import logger from '../utils/logger';

const prisma = new PrismaClient();

export class ProductController {
    /**
     * Récupère tous les produits
     */
    async getAllProducts(req: Request, res: Response, next: NextFunction) {
        try {
            logger.info('Récupération de tous les produits');
            const products = await prisma.product.findMany({
                orderBy: {
                    name: 'asc'
                }
            });
            res.json({ success: true, data: products });
        } catch (error) {
            next(ApiError.internal('Erreur lors de la récupération des produits', error));
        }
    }

    /**
     * Récupère un produit par son ID
     */
    async getProductById(req: Request, res: Response, next: NextFunction) {
        try {
            const id = req.params.id;
            if (!id) {
                throw ApiError.badRequest('ID de produit invalide');
            }

            logger.info(`Récupération du produit ${id}`);
            const product = await prisma.product.findUnique({
                where: { id }
            });
            
            if (!product) {
                throw ApiError.notFound('Produit non trouvé');
            }
            
            res.json({ success: true, data: product });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Crée un nouveau produit
     */
    async createProduct(req: Request, res: Response, next: NextFunction) {
        try {
            const { name, price, stock, is_queuable } = req.body;
            
            if (!name || price === undefined) {
                throw ApiError.badRequest('Nom et prix du produit requis');
            }

            logger.info('Création d\'un nouveau produit', { name, price });

            const newProduct = await prisma.product.create({
                data: {
                    name,
                    price: parseFloat(price),
                    stock: stock ? parseInt(stock) : 0,
                    is_queuable: is_queuable || false
                }
            });
            
            res.status(201).json({ 
                success: true, 
                message: 'Produit créé avec succès',
                data: newProduct 
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Met à jour un produit
     */
    async updateProduct(req: Request, res: Response, next: NextFunction) {
        try {
            const id = req.params.id;
            if (!id) {
                throw ApiError.badRequest('ID de produit invalide');
            }

            const { name, price, stock, is_queuable } = req.body;
            logger.info(`Mise à jour du produit ${id}`);

            // Vérifier si le produit existe
            const existingProduct = await prisma.product.findUnique({
                where: { id }
            });
            
            if (!existingProduct) {
                throw ApiError.notFound('Produit non trouvé');
            }

            const updatedProduct = await prisma.product.update({
                where: { id },
                data: {
                    name: name !== undefined ? name : undefined,
                    price: price !== undefined ? parseFloat(price) : undefined,
                    stock: stock !== undefined ? parseInt(stock) : undefined,
                    is_queuable: is_queuable !== undefined ? is_queuable : undefined
                }
            });
            
            res.json({ 
                success: true, 
                message: 'Produit mis à jour avec succès',
                data: updatedProduct 
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Supprime un produit
     */
    async deleteProduct(req: Request, res: Response, next: NextFunction) {
        try {
            const id = req.params.id;
            if (!id) {
                throw ApiError.badRequest('ID de produit invalide');
            }

            logger.info(`Suppression du produit ${id}`);
            
            // Vérifier si le produit existe
            const existingProduct = await prisma.product.findUnique({
                where: { id }
            });
            
            if (!existingProduct) {
                throw ApiError.notFound('Produit non trouvé');
            }
            
            // Vérifier si le produit est utilisé dans des commandes
            const orderItems = await prisma.orderItem.findFirst({
                where: { productId: id }
            });
            
            if (orderItems) {
                throw ApiError.badRequest('Ce produit ne peut pas être supprimé car il est utilisé dans des commandes');
            }
            
            await prisma.product.delete({
                where: { id }
            });
            
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }
} 