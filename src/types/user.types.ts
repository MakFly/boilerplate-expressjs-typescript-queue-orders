export interface User {
    id: string;
    email: string;
    name?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateUserDto {
    email: string;
    name: string | null;
}

export interface UpdateUserDto {
    email?: string;
    name?: string | null;
} 