"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Gestionnaire de workers permettant de lancer plusieurs instances
 * en fonction des variables d'environnement
 */
class WorkerManager {
    constructor() {
        this.workers = [];
        // Nombre de workers à lancer (par défaut: 1)
        this.workerCount = parseInt(process.env.WORKER_COUNT || '1', 10);
        // Type de worker à lancer (par défaut: stockVerification)
        this.workerType = process.env.WORKER_TYPE || 'stockVerification';
        logger_1.default.info(`Initializing worker manager with ${this.workerCount} workers of type: ${this.workerType}`);
    }
    /**
     * Démarre les workers selon la configuration
     */
    startWorkers() {
        const workerPath = this.getWorkerPath();
        logger_1.default.info(`Starting ${this.workerCount} workers of type: ${this.workerType}`);
        for (let i = 0; i < this.workerCount; i++) {
            const workerId = i + 1;
            // Passer des variables d'environnement spécifiques à chaque worker
            const env = {
                ...process.env,
                WORKER_ID: workerId.toString(),
            };
            const worker = (0, child_process_1.fork)(workerPath, [], { env });
            worker.on('exit', (code) => {
                logger_1.default.warn(`Worker ${workerId} exited with code ${code}`);
                this.restartWorker(workerId);
            });
            worker.on('error', (error) => {
                logger_1.default.error(`Worker ${workerId} error:`, error);
            });
            this.workers.push(worker);
            logger_1.default.info(`Started worker ${workerId}`);
        }
    }
    /**
     * Redémarre un worker spécifique en cas d'erreur
     */
    restartWorker(workerId) {
        const index = workerId - 1;
        if (this.workers[index]) {
            logger_1.default.info(`Restarting worker ${workerId}...`);
            const workerPath = this.getWorkerPath();
            const env = {
                ...process.env,
                WORKER_ID: workerId.toString(),
            };
            const worker = (0, child_process_1.fork)(workerPath, [], { env });
            worker.on('exit', (code) => {
                logger_1.default.warn(`Restarted worker ${workerId} exited with code ${code}`);
                this.restartWorker(workerId);
            });
            worker.on('error', (error) => {
                logger_1.default.error(`Restarted worker ${workerId} error:`, error);
            });
            this.workers[index] = worker;
            logger_1.default.info(`Worker ${workerId} restarted successfully`);
        }
    }
    /**
     * Obtient le chemin du fichier worker en fonction du type
     */
    getWorkerPath() {
        switch (this.workerType) {
            case 'stockVerification':
            default:
                return path_1.default.resolve(__dirname, 'stockVerificationWorker.ts');
        }
    }
    /**
     * Arrête tous les workers
     */
    stopWorkers() {
        logger_1.default.info('Stopping all workers...');
        this.workers.forEach((worker, index) => {
            if (worker && !worker.killed) {
                worker.kill();
                logger_1.default.info(`Worker ${index + 1} stopped`);
            }
        });
        this.workers = [];
    }
}
// Point d'entrée pour l'exécution directe du gestionnaire de workers
if (require.main === module) {
    const manager = new WorkerManager();
    // Gestion des signaux pour arrêter proprement les workers
    process.on('SIGINT', () => {
        logger_1.default.info('Received SIGINT signal');
        manager.stopWorkers();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        logger_1.default.info('Received SIGTERM signal');
        manager.stopWorkers();
        process.exit(0);
    });
    // Démarrer les workers
    manager.startWorkers();
}
exports.default = WorkerManager;
