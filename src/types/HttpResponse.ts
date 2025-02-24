export enum HttpStatus {
    OK = 200,
    CREATED = 201,
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    CONFLICT = 409,
    INTERNAL_SERVER_ERROR = 500
}

export type ApiResponse<T = any> = {
    success: boolean;
    message?: string;
    data?: T;
    errors?: any[];
}

export const HttpMessages = {
    [HttpStatus.OK]: "Operation successful",
    [HttpStatus.CREATED]: "Resource created successfully",
    [HttpStatus.BAD_REQUEST]: "Invalid request",
    [HttpStatus.UNAUTHORIZED]: "Unauthorized",
    [HttpStatus.FORBIDDEN]: "Access forbidden",
    [HttpStatus.NOT_FOUND]: "Resource not found",
    [HttpStatus.CONFLICT]: "Conflict with current state",
    [HttpStatus.INTERNAL_SERVER_ERROR]: "Internal server error"
} as const; 