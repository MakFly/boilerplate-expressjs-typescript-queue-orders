"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app_1 = __importDefault(require("./app"));
const http_1 = __importDefault(require("http"));
const logger_1 = __importDefault(require("./utils/logger"));
const PORT = process.env.PORT || 3000;
// Créer un serveur HTTP à partir de l'application Express
const server = http_1.default.createServer(app_1.default);
// Initialiser le contrôleur WebSocket
// initWebSocketController(server);
// Démarrer le serveur
server.listen(PORT, () => {
    logger_1.default.info(`🚀 Server running on port ${PORT}`);
});
