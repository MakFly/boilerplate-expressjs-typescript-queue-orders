import { User } from '../types/User';

class UserService {
    private users: User[] = [
        {
            id: 1,
            name: "John Doe",
            email: "john@example.com",
            createdAt: new Date()
        }
    ];

    async findAll(): Promise<User[]> {
        return this.users;
    }

    async findById(id: number): Promise<User | undefined> {
        return this.users.find(u => u.id === id);
    }

    async create(userData: Omit<User, 'id' | 'createdAt'>): Promise<User> {
        const newUser: User = {
            id: this.users.length + 1,
            ...userData,
            createdAt: new Date()
        };
        this.users.push(newUser);
        return newUser;
    }

    async update(id: number, userData: Partial<User>): Promise<User | null> {
        const userIndex = this.users.findIndex(u => u.id === id);
        if (userIndex === -1) return null;

        this.users[userIndex] = {
            ...this.users[userIndex],
            ...userData
        };

        return this.users[userIndex];
    }

    async delete(id: number): Promise<boolean> {
        const initialLength = this.users.length;
        this.users = this.users.filter(u => u.id !== id);
        return this.users.length !== initialLength;
    }

    async findByEmail(email: string): Promise<User | undefined> {
        return this.users.find(u => u.email === email);
    }
}

export const userService = new UserService(); 