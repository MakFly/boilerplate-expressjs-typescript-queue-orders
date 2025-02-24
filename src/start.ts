import { startWorkers } from './workers/startWorkers';
import logger from './utils/logger';

logger.info('Démarrage de l\'application...');
startWorkers(); 