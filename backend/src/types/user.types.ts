export interface User {
    id: string;
    email: string;
    name?: string;
    password?: string;
    role?: string;
    createdAt: Date;
    updatedAt: Date;
}

// Importer l'enum Role depuis Prisma
import { Role } from '@prisma/client';

export interface CreateUserDto {
    email: string;
    name: string | null;
    password: string;
    role: Role; // Utiliser l'enum Role et le rendre obligatoire
}

export interface UpdateUserDto {
    email?: string;
    name?: string | null;
    password?: string;
    role?: Role; // Utiliser l'enum Role
}

export interface LoginDto {
    email: string;
    password: string;
}

export interface AuthResponse {
    token: string;
    user: {
        id: string;
        email: string;
        name?: string;
        role?: string;
    };
} 