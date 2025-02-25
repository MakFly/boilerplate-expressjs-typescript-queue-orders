import { PrismaService } from "./PrismaService";
import { User } from "@prisma/client";

export interface IUserService {
  findById(id: string): Promise<User | null>;
  create(userData: Omit<User, "id" | "createdAt" | "updatedAt">): Promise<User>;
  findAll(): Promise<User[]>;
  update(id: string, userData: Partial<User>): Promise<User | null>;
  delete(id: string): Promise<boolean>;
  findByEmail(email: string): Promise<User | null>;
  validateUser(email: string, password: string): Promise<User | null>;
}

export class UserService implements IUserService {
  constructor(private readonly prismaService: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    return this.prismaService.client.user.findUnique({ where: { id } });
  }

  async create(
    userData: Omit<User, "id" | "createdAt" | "updatedAt">
  ): Promise<User> {
    return this.prismaService.client.user.create({
      data: userData,
    });
  }

  async findAll(): Promise<User[]> {
    return this.prismaService.client.user.findMany();
  }

  async update(id: string, userData: Partial<User>): Promise<User | null> {
    return this.prismaService.client.user.update({
      where: { id },
      data: userData,
    });
  }

  async delete(id: string): Promise<boolean> {
    const user = await this.prismaService.client.user.delete({ where: { id } });
    return !!user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prismaService.client.user.findUnique({ where: { email } });
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.findByEmail(email);
    if (!user) {
      return null;
    }
    // Note: Implement actual password validation here when authentication is added
    return user;
  }
}
