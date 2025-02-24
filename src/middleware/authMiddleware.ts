import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../auth/jwt";

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Token manquant" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Token manquant" });
  }

  try {
    const payload = await verifyToken(token);
    // On peut attacher le payload à la requête (ex. req.user)
    (req as any).user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Token invalide" });
  }
}
