import { Router, Request, Response } from "express";
import { signToken } from "../auth/jwt";

const router = Router();

router.post("/login", async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email requis" });
  }
  try {
    // Dans une application réelle, validez les credentials
    const token = await signToken({ email });
    res.json({ token });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
