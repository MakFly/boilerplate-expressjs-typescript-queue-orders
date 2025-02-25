"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const UserService_1 = require("../services/UserService");
const PrismaService_1 = require("../services/PrismaService");
class UserController {
    /**
     * Récupère la liste des utilisateurs
     */
    static async getUsers(req, res) {
        try {
            const users = await this.userService.findAll();
            res.status(200).json({
                success: true,
                data: users
            });
        }
        catch (error) {
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
    static async createUser(req, res) {
        try {
            const userData = req.body;
            // Vérifier si l'email existe déjà
            const existingUser = await this.userService.findByEmail(userData.email);
            if (existingUser) {
                res.status(400).json({
                    success: false,
                    message: "Un utilisateur avec cet email existe déjà"
                });
                return;
            }
            const newUser = await this.userService.create(userData);
            res.status(201).json({
                success: true,
                data: newUser
            });
        }
        catch (error) {
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
    static async getUserById(req, res) {
        try {
            const userId = req.params.id;
            const user = await this.userService.findById(userId);
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
        }
        catch (error) {
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
    static async updateUser(req, res) {
        try {
            const userId = req.params.id;
            const userData = req.body;
            // Vérifier si l'email existe déjà pour un autre utilisateur
            if (userData.email) {
                const existingUser = await this.userService.findByEmail(userData.email);
                if (existingUser && existingUser.id !== userId) {
                    res.status(400).json({
                        success: false,
                        message: "Un autre utilisateur utilise déjà cet email"
                    });
                    return;
                }
            }
            const updatedUser = await this.userService.update(userId, userData);
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
        }
        catch (error) {
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
    static async deleteUser(req, res) {
        try {
            const userId = req.params.id;
            const deleted = await this.userService.delete(userId);
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
        }
        catch (error) {
            res.status(500).json({
                success: false,
                message: "Erreur lors de la suppression de l'utilisateur",
                error: error instanceof Error ? error.message : "Une erreur inconnue est survenue"
            });
        }
    }
}
exports.UserController = UserController;
UserController.userService = new UserService_1.UserService(new PrismaService_1.PrismaService());
