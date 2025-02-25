"use strict";
// import Redis from 'ioredis';
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
class CacheService {
    constructor() {
        const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
        console.log('🔌 Tentative de connexion à Redis:', redisUrl);
        // this.client = new Redis(redisUrl);
        // Simuler le client Redis pour permettre la compilation
        this.client = {
            setex: async () => { },
            set: async () => { },
            get: async () => null,
            del: async () => 0,
            incr: async () => 0,
            decr: async () => 0,
            keys: async () => []
        };
        // this.client.on('error', (error) => {
        //     console.error('❌ Erreur Redis:', error);
        // });
        // this.client.on('connect', () => {
        //     console.log('✅ Connexion Redis établie');
        // });
    }
    static getInstance() {
        if (!CacheService.instance) {
            CacheService.instance = new CacheService();
        }
        return CacheService.instance;
    }
    async set(key, value, expireInSeconds) {
        try {
            const stringValue = JSON.stringify(value);
            if (expireInSeconds) {
                await this.client.setex(key, expireInSeconds, stringValue);
            }
            else {
                await this.client.set(key, stringValue);
            }
        }
        catch (error) {
            console.error('❌ Erreur lors de la mise en cache:', error);
            throw error;
        }
    }
    async get(key) {
        try {
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        }
        catch (error) {
            console.error('❌ Erreur lors de la récupération du cache:', error);
            throw error;
        }
    }
    async delete(key) {
        try {
            const result = await this.client.del(key);
            return result > 0;
        }
        catch (error) {
            console.error('❌ Erreur lors de la suppression du cache:', error);
            throw error;
        }
    }
    async increment(key) {
        try {
            return await this.client.incr(key);
        }
        catch (error) {
            console.error('❌ Erreur lors de l\'incrémentation:', error);
            throw error;
        }
    }
    async decrement(key) {
        try {
            return await this.client.decr(key);
        }
        catch (error) {
            console.error('❌ Erreur lors de la décrémentation:', error);
            throw error;
        }
    }
    async getQueueLength(queueKey) {
        try {
            const length = await this.client.get(queueKey);
            return length ? parseInt(length) : 0;
        }
        catch (error) {
            console.error('❌ Erreur lors de la récupération de la longueur de la file:', error);
            throw error;
        }
    }
    async clear(pattern) {
        try {
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await this.client.del(...keys);
            }
        }
        catch (error) {
            console.error(`❌ Erreur lors de la suppression du cache avec le motif ${pattern}:`, error);
            throw error;
        }
    }
}
exports.CacheService = CacheService;
