import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import http from 'http';
import { initWebSocketController } from './controllers/WebSocketController';
import logger from './utils/logger';

const PORT = process.env.PORT || 3000;

// Créer un serveur HTTP à partir de l'application Express
const server = http.createServer(app);

// Initialiser le contrôleur WebSocket
// initWebSocketController(server);

// Démarrer le serveur
server.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
});
