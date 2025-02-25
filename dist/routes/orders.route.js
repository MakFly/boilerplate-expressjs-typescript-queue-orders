"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const OrderController_1 = require("../controllers/OrderController");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
const orderController = new OrderController_1.OrderController();
// Routes protégées par authentification
router.use(auth_middleware_1.authMiddleware);
// Récupérer toutes les commandes
router.get('/', orderController.getAllOrders.bind(orderController));
// Récupérer une commande par ID
router.get('/:id', orderController.getOrderById.bind(orderController));
// Créer une nouvelle commande
router.post('/', orderController.createOrder.bind(orderController));
// Mettre à jour le statut d'une commande
router.patch('/:id/status', orderController.updateOrderStatus.bind(orderController));
// Valider manuellement une commande
router.post('/:id/validate', orderController.validateOrder.bind(orderController));
// Supprimer une commande
router.delete('/:id', orderController.deleteOrder.bind(orderController));
exports.default = router;
