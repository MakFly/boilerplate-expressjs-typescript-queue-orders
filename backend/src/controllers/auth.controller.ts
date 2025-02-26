import { Request, Response, NextFunction } from 'express';
import { signToken, verifyToken } from '../auth/jwt';
import { UserService } from '../services/UserService';
import { PrismaService } from '../services/PrismaService';
import bcrypt from 'bcrypt';
import { ApiError } from '../utils/ApiError';

export class AuthController {
    // Initialisation correcte du service statique
    private static userService = new UserService(new PrismaService());

    /**
     * Authentifie un utilisateur et génère un token JWT
     */
    public static login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                throw ApiError.badRequest("Email et mot de passe requis");
            }

            // Rechercher l'utilisateur par email
            const user = await AuthController.userService.findByEmail(email);
            if (!user) {
                throw ApiError.badRequest("Identifiants invalides");
            }

            // Vérifier le mot de passe
            // Note: Dans une application réelle, utilisez bcrypt.compare
            // Pour cet exemple, nous simulons une vérification
            const isPasswordValid = password === 'admin123'; // Simulé pour l'exemple
            
            if (!isPasswordValid) {
                throw ApiError.badRequest("Identifiants invalides");
            }

            // Générer le token JWT avec un rôle par défaut 'user'
            // Puisque le type User n'a pas de propriété role, nous utilisons un rôle par défaut
            const token = await signToken({ 
                id: user.id,
                email: user.email,
                role: user.role
            });

            // Retourner le token et les informations de l'utilisateur
            res.status(200).json({
                success: true,
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role
                }
            });
        } catch (error) {
            // Propager l'erreur au middleware de gestion d'erreurs
            next(error);
        }
    }

    /**
     * Récupère les informations de l'utilisateur connecté
     */
    public static getCurrentUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // L'utilisateur est déjà vérifié par le middleware d'authentification
            const user = req.user;

            if (!user) {
                throw ApiError.unauthorized("Non authentifié");
            }

            // Récupérer les informations complètes de l'utilisateur depuis la base de données
            const userDetails = await AuthController.userService.findById(user.id);
            
            if (!userDetails) {
                throw ApiError.notFound("Utilisateur non trouvé");
            }

            // Retourner les informations de l'utilisateur (sans le mot de passe)
            res.status(200).json({
                success: true,
                id: userDetails.id,
                email: userDetails.email,
                name: userDetails.name,
                // Utiliser le rôle du token si disponible, sinon 'user'
                role: user.role || 'user',
                createdAt: userDetails.createdAt,
                updatedAt: userDetails.updatedAt
            });
        } catch (error) {
            // Propager l'erreur au middleware de gestion d'erreurs
            next(error);
        }
    }

    /**
     * Valide un token JWT
     */
    public static validateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // Le token est déjà vérifié par le middleware d'authentification
            // Si nous arrivons ici, c'est que le token est valide
            res.status(200).json({
                success: true,
                message: "Token valide",
                user: req.user
            });
        } catch (error) {
            // Propager l'erreur au middleware de gestion d'erreurs
            next(error);
        }
    }
} 