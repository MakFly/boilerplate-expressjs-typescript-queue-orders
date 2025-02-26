import { Request, Response } from 'express';
import { UserService } from '../services/UserService';
import { PrismaService } from '../services/PrismaService';
import { CreateUserDto, UpdateUserDto } from '../types/user.types';
import { Role } from '@prisma/client';

export class UserController {
    private static userService = new UserService(new PrismaService());

    /**
     * Récupère la liste des utilisateurs
     */
    public static async getUsers(req: Request, res: Response): Promise<void> {
        try {
            const users = await UserController.userService.findAll();
            res.status(200).json({
                success: true,
                data: users
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Erreur lors de la récupération des utilisateurs",
                error: error instanceof Error ? error.message : "Une erreur inconnue est survenue"
            });
        }
    }

    /**
     * Crée un nouvel utilisateur
     */
    public static async createUser(req: Request, res: Response): Promise<void> {
        try {
            const userData: CreateUserDto = req.body;
            
            // Vérifier si l'email existe déjà
            const existingUser = await UserController.userService.findByEmail(userData.email);
            if (existingUser) {
                res.status(400).json({
                    success: false,
                    message: "Un utilisateur avec cet email existe déjà"
                });
                return;
            }

            // Définir le rôle par défaut si non fourni
            if (!userData.role) {
                userData.role = Role.USER;
            }

            const newUser = await UserController.userService.create(userData);
            res.status(201).json({
                success: true,
                data: newUser
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Erreur lors de la création de l'utilisateur",
                error: error instanceof Error ? error.message : "Une erreur inconnue est survenue"
            });
        }
    }

    /**
     * Récupère un utilisateur par son ID
     */
    public static async getUserById(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.params.id;
            const user = await UserController.userService.findById(userId);
            
            if (!user) {
                res.status(404).json({
                    success: false,
                    message: "Utilisateur non trouvé"
                });
                return;
            }

            res.status(200).json({
                success: true,
                data: user
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Erreur lors de la récupération de l'utilisateur",
                error: error instanceof Error ? error.message : "Une erreur inconnue est survenue"
            });
        }
    }

    /**
     * Met à jour un utilisateur
     */
    public static async updateUser(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.params.id;
            const userData: UpdateUserDto = req.body;

            // Vérifier si l'email existe déjà pour un autre utilisateur
            if (userData.email) {
                const existingUser = await UserController.userService.findByEmail(userData.email);
                if (existingUser && existingUser.id !== userId) {
                    res.status(400).json({
                        success: false,
                        message: "Un autre utilisateur utilise déjà cet email"
                    });
                    return;
                }
            }

            const updatedUser = await UserController.userService.update(userId, userData);
            if (!updatedUser) {
                res.status(404).json({
                    success: false,
                    message: "Utilisateur non trouvé"
                });
                return;
            }

            res.status(200).json({
                success: true,
                data: updatedUser
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Erreur lors de la mise à jour de l'utilisateur",
                error: error instanceof Error ? error.message : "Une erreur inconnue est survenue"
            });
        }
    }

    /**
     * Supprime un utilisateur
     */
    public static async deleteUser(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.params.id;
            const deleted = await UserController.userService.delete(userId);
            
            if (!deleted) {
                res.status(404).json({
                    success: false,
                    message: "Utilisateur non trouvé"
                });
                return;
            }

            res.status(200).json({
                success: true,
                message: "Utilisateur supprimé avec succès"
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: "Erreur lors de la suppression de l'utilisateur",
                error: error instanceof Error ? error.message : "Une erreur inconnue est survenue"
            });
        }
    }
}