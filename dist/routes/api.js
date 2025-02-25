"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = __importDefault(require("./auth"));
const users_route_1 = __importDefault(require("./users.route"));
const orders_route_1 = __importDefault(require("./orders.route"));
const router = (0, express_1.Router)();
// Routes de base
router.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
// Routes d'authentification
router.use('/auth', auth_1.default);
// Routes utilisateurs
router.use('/users', users_route_1.default);
// Routes commandes
router.use('/orders', orders_route_1.default);
exports.default = router;
