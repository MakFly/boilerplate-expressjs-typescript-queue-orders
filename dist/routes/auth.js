"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jwt_1 = require("../auth/jwt");
const router = (0, express_1.Router)();
router.post("/login", async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: "Email requis" });
    }
    try {
        // Dans une application réelle, validez les credentials
        const token = await (0, jwt_1.signToken)({ email });
        res.json({ token });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
