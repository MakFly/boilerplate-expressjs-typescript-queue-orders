/**
 * Classe d'erreur personnalisée pour les services
 */
export class ServiceError extends Error {
  statusCode: number;
  
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
    
    // Cette ligne est nécessaire en TypeScript pour conserver la trace de la pile d'appels
    Error.captureStackTrace(this, this.constructor);
  }
} 