import { PrismaClient } from '@prisma/client';

class PrismaService {
    private static instance: PrismaService;
    private prisma: PrismaClient;

    private constructor() {
        this.prisma = new PrismaClient({
            log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
        });
    }

    public static getInstance(): PrismaService {
        if (!PrismaService.instance) {
            PrismaService.instance = new PrismaService();
        }
        return PrismaService.instance;
    }

    public getClient(): PrismaClient {
        return this.prisma;
    }

    public async disconnect(): Promise<void> {
        await this.prisma.$disconnect();
    }
}

export const prisma = PrismaService.getInstance().getClient(); 