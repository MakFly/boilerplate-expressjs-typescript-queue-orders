import Redis from 'ioredis';

export class CacheService {
    private static instance: CacheService;
    private client: Redis;

    private constructor() {
        const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
        console.log('🔌 Tentative de connexion à Redis:', redisUrl);
        this.client = new Redis(redisUrl);
        
        this.client.on('error', (error) => {
            console.error('❌ Erreur Redis:', error);
        });

        this.client.on('connect', () => {
            console.log('✅ Connexion Redis établie');
        });
    }

    static getInstance(): CacheService {
        if (!CacheService.instance) {
            CacheService.instance = new CacheService();
        }
        return CacheService.instance;
    }

    async set(key: string, value: any, expireInSeconds?: number): Promise<void> {
        try {
            const stringValue = JSON.stringify(value);
            if (expireInSeconds) {
                await this.client.setex(key, expireInSeconds, stringValue);
            } else {
                await this.client.set(key, stringValue);
            }
        } catch (error) {
            console.error('❌ Erreur lors de la mise en cache:', error);
            throw error;
        }
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.error('❌ Erreur lors de la récupération du cache:', error);
            throw error;
        }
    }

    async delete(key: string): Promise<void> {
        try {
            await this.client.del(key);
        } catch (error) {
            console.error('❌ Erreur lors de la suppression du cache:', error);
            throw error;
        }
    }

    async increment(key: string): Promise<number> {
        try {
            return await this.client.incr(key);
        } catch (error) {
            console.error('❌ Erreur lors de l\'incrémentation:', error);
            throw error;
        }
    }

    async decrement(key: string): Promise<number> {
        try {
            return await this.client.decr(key);
        } catch (error) {
            console.error('❌ Erreur lors de la décrémentation:', error);
            throw error;
        }
    }

    async getQueueLength(queueKey: string): Promise<number> {
        try {
            const length = await this.client.get(queueKey);
            return length ? parseInt(length) : 0;
        } catch (error) {
            console.error('❌ Erreur lors de la récupération de la longueur de la file:', error);
            throw error;
        }
    }
} 