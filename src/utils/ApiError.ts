export class ApiError extends Error {
    statusCode: number;
    details?: any;

    constructor(statusCode: number, message: string, details?: any) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.name = 'ApiError';
    }

    static badRequest(message: string, details?: any) {
        return new ApiError(400, message, details);
    }

    static notFound(message: string, details?: any) {
        return new ApiError(404, message, details);
    }

    static internal(message: string, details?: any) {
        return new ApiError(500, message, details);
    }
} 