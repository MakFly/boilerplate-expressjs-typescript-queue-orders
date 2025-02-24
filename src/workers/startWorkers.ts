import StockVerificationWorker from './stockVerificationWorker';
import logger from '../utils/logger';
import * as os from 'os';

// Nombre de workers basé sur le nombre de CPU disponibles
// On utilise la moitié des CPU disponibles pour laisser des ressources pour d'autres processus
const WORKER_COUNT = Math.max(1, Math.floor(os.cpus().length / 2));

function startWorkers() {
    logger.info(`Démarrage de ${WORKER_COUNT} workers...`);

    for (let i = 1; i <= WORKER_COUNT; i++) {
        new StockVerificationWorker(`worker-${i}`);
    }
}

// Démarrer les workers
startWorkers(); 