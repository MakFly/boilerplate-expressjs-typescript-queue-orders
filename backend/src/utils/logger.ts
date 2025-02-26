import winston from 'winston';
import path from 'path';
import { getWebSocketController } from "../controllers/websocket.controller";

// Définir les niveaux de log et leurs couleurs
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Définir les couleurs pour chaque niveau
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Ajouter les couleurs à winston
winston.addColors(colors);

// Format personnalisé pour les logs
const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  // Convertir les objets en chaînes de caractères
  let metaStr = '';
  if (Object.keys(metadata).length > 0) {
    metaStr = JSON.stringify(metadata);
  }
  
  return `${timestamp} [${level}]: ${message} ${metaStr}`;
});

// Interface pour notre format personnalisé
interface CustomFormat extends winston.Logform.Format {
  sentMessages: Map<string, number>;
}

// Déterminer si nous sommes dans un worker ou dans l'API
const isWorker = process.argv.some(arg => 
  arg.includes('worker') || 
  arg.includes('stockVerification') || 
  process.env.WORKER_ID !== undefined
);

// Déterminer si nous sommes dans le processus principal de l'API (pas un worker)
const isMainApiProcess = !isWorker && !process.argv.some(arg => arg.includes('websocket'));

// Ajouter un préfixe pour identifier la source des logs
const processPrefix = isWorker 
  ? `[Worker${process.env.WORKER_ID ? `-${process.env.WORKER_ID}` : ''}] `
  : '[API] ';

// Format personnalisé avec préfixe
const prefixFormat = winston.format((info) => {
  info.message = `${processPrefix}${info.message}`;
  return info;
});

// Créer un format qui envoie les logs au WebSocket, mais uniquement si nous sommes dans l'API
// et pas dans un contexte qui pourrait créer une dépendance circulaire
const websocketFormatFn = winston.format((info) => {
  // Ne pas essayer d'envoyer les logs au WebSocket si nous sommes dans un worker
  // ou si le message contient déjà des références au WebSocket pour éviter les boucles
  if (isWorker || (typeof info.message === 'string' && info.message.includes('WebSocket'))) {
    return info;
  }
  
  try {
    // Récupérer le contrôleur WebSocket
    const wsController = getWebSocketController();
    
    // Si le contrôleur existe et que le message n'a pas déjà été envoyé, diffuser le message
    if (wsController) {
      // Vérifier si le message a déjà été envoyé récemment (dans les 500ms)
      const messageKey = `${info.level}:${info.message}`;
      const now = Date.now();
      
      // Utiliser une variable statique pour stocker les derniers messages envoyés
      const format = websocketFormat as CustomFormat;
      if (!format.sentMessages) {
        format.sentMessages = new Map();
      }
      
      // Vérifier si ce message a déjà été envoyé récemment
      const lastSent = format.sentMessages.get(messageKey);
      if (!lastSent || (now - lastSent) > 500) {
        // Créer l'objet de log en filtrant les propriétés
        const { timestamp, level, message, ...metadata } = info;

        // Diffuser le message
        wsController.broadcastLogMessage({
          timestamp,
          level,
          message,
          metadata
        });
        
        // Enregistrer l'heure d'envoi
        format.sentMessages.set(messageKey, now);
        
        // Nettoyer les messages anciens (plus de 10 secondes)
        for (const [key, time] of format.sentMessages.entries()) {
          if (now - time > 10000) {
            format.sentMessages.delete(key);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error broadcasting log message:', error);
  }
  
  return info;
});

// Créer le format et initialiser la Map
const websocketFormat = websocketFormatFn();
(websocketFormat as CustomFormat).sentMessages = new Map();

// Définir le format pour les logs de console
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  prefixFormat(),
  // N'ajouter le websocketFormat que pour l'API principale, pas pour les workers ni pour les logs liés au WebSocket
  ...(isMainApiProcess ? [websocketFormat] : []),
  customFormat
);

// Définir le format pour les logs de fichier (sans WebSocket pour éviter la duplication)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  prefixFormat(),
  winston.format.json()
);

// Définir les transports
const transports = [
  // Logs d'erreur dans un fichier
  new winston.transports.File({
    filename: path.join('logs', 'error.log'),
    level: 'error',
    format: fileFormat,
  }),
  // Tous les logs dans un fichier
  new winston.transports.File({
    filename: path.join('logs', 'all.log'),
    format: fileFormat,
  }),
  // Logs dans la console
  new winston.transports.Console({
    format: consoleFormat,
  }),
];

// Créer l'instance de logger
export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  levels,
  transports,
});

// Exporter le logger par défaut
export default logger;
