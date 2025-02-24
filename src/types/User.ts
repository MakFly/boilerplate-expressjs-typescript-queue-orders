export interface User {
    id: number;
    email: string;
    name: string;
    createdAt: Date;
}

export interface CreateUserDto {
    email: string;
    name: string;
}

export interface UpdateUserDto {
    email?: string;
    name?: string;
} 