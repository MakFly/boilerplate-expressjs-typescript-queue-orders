import { Server, Socket } from 'socket.io';
import logger from '../config/logger';

/**
 * Service pour gérer les communications WebSocket
 */
export class SocketService {
  private io: Server | null = null;

  /**
   * Initialiser le service avec une instance de Socket.IO
   */
  initialize(io: Server) {
    this.io = io;
    logger.info('Socket service initialized');
    
    // Événements de base pour les connexions
    this.io.on('connection', (socket: Socket) => {
      logger.info(`New socket connection: ${socket.id}`);
      
      socket.on('disconnect', () => {
        logger.info(`Socket disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Diffuser un événement à tous les clients connectés
   */
  broadcast(event: string, data: any) {
    if (!this.io) {
      logger.warn('Socket broadcast failed: Socket.IO not initialized');
      return;
    }
    
    logger.debug(`Broadcasting ${event}`, { data });
    this.io.emit(event, data);
  }

  /**
   * Envoyer un événement à un client spécifique
   */
  sendToClient(socketId: string, event: string, data: any) {
    if (!this.io) {
      logger.warn('Socket send failed: Socket.IO not initialized');
      return;
    }
    
    logger.debug(`Sending ${event} to ${socketId}`, { data });
    this.io.to(socketId).emit(event, data);
  }

  /**
   * Envoyer un message à une salle spécifique
   */
  public sendToRoom(room: string, event: string, data: any): void {
    if (!this.io) {
      logger.warn('SocketService: Cannot send to room, socket.io not initialized');
      return;
    }
    
    this.io.to(room).emit(event, data);
    logger.debug(`SocketService: Sent ${event} to room ${room}`);
  }
}

// Exporter une instance singleton
export const socketService = new SocketService(); 