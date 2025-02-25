import { PrismaClient } from '@prisma/client';

export class PrismaService {
    public client: PrismaClient;

    constructor() {
        this.client = new PrismaClient();
    }

    async connect(): Promise<void> {
        await this.client.$connect();
    }

    async disconnect(): Promise<void> {
        await this.client.$disconnect();
    }
}

export const prisma = new PrismaService().client;