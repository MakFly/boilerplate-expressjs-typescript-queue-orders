"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiError = void 0;
class ApiError extends Error {
    constructor(statusCode, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.name = 'ApiError';
    }
    static badRequest(message, details) {
        return new ApiError(400, message, details);
    }
    static notFound(message, details) {
        return new ApiError(404, message, details);
    }
    static internal(message, details) {
        return new ApiError(500, message, details);
    }
}
exports.ApiError = ApiError;
