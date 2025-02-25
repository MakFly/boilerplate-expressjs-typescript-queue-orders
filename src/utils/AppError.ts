export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  details?: any;

  constructor(message: string, statusCode: number, isOperational = true, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    
    // Capture de la stack trace
    Error.captureStackTrace(this, this.constructor);
    
    // Définir le nom de l'erreur
    this.name = this.constructor.name;
  }
}

// Fonction utilitaire pour créer des erreurs courantes
export const createNotFoundError = (resource: string, id?: string) => {
  const message = id 
    ? `${resource} avec l'ID ${id} non trouvé(e)`
    : `${resource} non trouvé(e)`;
  return new AppError(message, 404);
};

export const createBadRequestError = (message: string) => {
  return new AppError(message, 400);
};

export const createUnauthorizedError = (message = 'Non autorisé') => {
  return new AppError(message, 401);
};

export const createForbiddenError = (message = 'Accès interdit') => {
  return new AppError(message, 403);
};

export const createConflictError = (message: string) => {
  return new AppError(message, 409);
};

export const createValidationError = (message: string, details: any) => {
  return new AppError(message, 422, true, details);
}; 