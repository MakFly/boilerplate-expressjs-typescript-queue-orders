"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = exports.PrismaService = void 0;
const client_1 = require("@prisma/client");
class PrismaService {
    constructor() {
        this.client = new client_1.PrismaClient();
    }
    async connect() {
        await this.client.$connect();
    }
    async disconnect() {
        await this.client.$disconnect();
    }
}
exports.PrismaService = PrismaService;
exports.prisma = new PrismaService().client;
