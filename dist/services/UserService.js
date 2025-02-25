"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
class UserService {
    constructor(prismaService) {
        this.prismaService = prismaService;
    }
    async findById(id) {
        return this.prismaService.client.user.findUnique({ where: { id } });
    }
    async create(userData) {
        return this.prismaService.client.user.create({
            data: userData,
        });
    }
    async findAll() {
        return this.prismaService.client.user.findMany();
    }
    async update(id, userData) {
        return this.prismaService.client.user.update({
            where: { id },
            data: userData,
        });
    }
    async delete(id) {
        const user = await this.prismaService.client.user.delete({ where: { id } });
        return !!user;
    }
    async findByEmail(email) {
        return this.prismaService.client.user.findUnique({ where: { email } });
    }
    async validateUser(email, password) {
        const user = await this.findByEmail(email);
        if (!user) {
            return null;
        }
        // Note: Implement actual password validation here when authentication is added
        return user;
    }
}
exports.UserService = UserService;
