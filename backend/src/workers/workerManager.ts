import { fork, ChildProcess } from 'child_process';
import path from 'path';
import logger from '../utils/logger';

/**
 * Gestionnaire de workers permettant de lancer plusieurs instances
 * en fonction des variables d'environnement
 */
class WorkerManager {
  private workers: ChildProcess[] = [];
  private workerCount: number;
  private workerType: string;

  constructor() {
    // Nombre de workers à lancer (par défaut: 1)
    this.workerCount = parseInt(process.env.WORKER_COUNT || '1', 10);
    
    // Type de worker à lancer (par défaut: stockVerification)
    this.workerType = process.env.WORKER_TYPE || 'stockVerification';
    
    logger.info(`Initializing worker manager with ${this.workerCount} workers of type: ${this.workerType}`);
  }

  /**
   * Démarre les workers selon la configuration
   */
  public startWorkers(): void {
    const workerPath = this.getWorkerPath();
    
    logger.info(`Starting ${this.workerCount} workers of type: ${this.workerType}`);
    
    for (let i = 0; i < this.workerCount; i++) {
      const workerId = i + 1;
      
      // Passer des variables d'environnement spécifiques à chaque worker
      const env = {
        ...process.env,
        WORKER_ID: workerId.toString(),
      };
      
      const worker = fork(workerPath, [], { env });
      
      worker.on('exit', (code) => {
        logger.warn(`Worker ${workerId} exited with code ${code}`);
        this.restartWorker(workerId);
      });
      
      worker.on('error', (error) => {
        logger.error(`Worker ${workerId} error:`, error);
      });
      
      this.workers.push(worker);
      logger.info(`Started worker ${workerId}`);
    }
  }

  /**
   * Redémarre un worker spécifique en cas d'erreur
   */
  private restartWorker(workerId: number): void {
    const index = workerId - 1;
    
    if (this.workers[index]) {
      logger.info(`Restarting worker ${workerId}...`);
      
      const workerPath = this.getWorkerPath();
      const env = {
        ...process.env,
        WORKER_ID: workerId.toString(),
      };
      
      const worker = fork(workerPath, [], { env });
      
      worker.on('exit', (code) => {
        logger.warn(`Restarted worker ${workerId} exited with code ${code}`);
        this.restartWorker(workerId);
      });
      
      worker.on('error', (error) => {
        logger.error(`Restarted worker ${workerId} error:`, error);
      });
      
      this.workers[index] = worker;
      logger.info(`Worker ${workerId} restarted successfully`);
    }
  }

  /**
   * Obtient le chemin du fichier worker en fonction du type
   */
  private getWorkerPath(): string {
    switch (this.workerType) {
      case 'stockVerification':
      default:
        return path.resolve(__dirname, 'stockVerificationWorker.ts');
    }
  }

  /**
   * Arrête tous les workers
   */
  public stopWorkers(): void {
    logger.info('Stopping all workers...');
    
    this.workers.forEach((worker, index) => {
      if (worker && !worker.killed) {
        worker.kill();
        logger.info(`Worker ${index + 1} stopped`);
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
    logger.info('Received SIGINT signal');
    manager.stopWorkers();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM signal');
    manager.stopWorkers();
    process.exit(0);
  });
  
  // Démarrer les workers
  manager.startWorkers();
}

export default WorkerManager; 