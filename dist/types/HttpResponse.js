"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpMessages = exports.HttpStatus = void 0;
var HttpStatus;
(function (HttpStatus) {
    HttpStatus[HttpStatus["OK"] = 200] = "OK";
    HttpStatus[HttpStatus["CREATED"] = 201] = "CREATED";
    HttpStatus[HttpStatus["BAD_REQUEST"] = 400] = "BAD_REQUEST";
    HttpStatus[HttpStatus["UNAUTHORIZED"] = 401] = "UNAUTHORIZED";
    HttpStatus[HttpStatus["FORBIDDEN"] = 403] = "FORBIDDEN";
    HttpStatus[HttpStatus["NOT_FOUND"] = 404] = "NOT_FOUND";
    HttpStatus[HttpStatus["CONFLICT"] = 409] = "CONFLICT";
    HttpStatus[HttpStatus["INTERNAL_SERVER_ERROR"] = 500] = "INTERNAL_SERVER_ERROR";
})(HttpStatus || (exports.HttpStatus = HttpStatus = {}));
exports.HttpMessages = {
    [HttpStatus.OK]: "Operation successful",
    [HttpStatus.CREATED]: "Resource created successfully",
    [HttpStatus.BAD_REQUEST]: "Invalid request",
    [HttpStatus.UNAUTHORIZED]: "Unauthorized",
    [HttpStatus.FORBIDDEN]: "Access forbidden",
    [HttpStatus.NOT_FOUND]: "Resource not found",
    [HttpStatus.CONFLICT]: "Conflict with current state",
    [HttpStatus.INTERNAL_SERVER_ERROR]: "Internal server error"
};
