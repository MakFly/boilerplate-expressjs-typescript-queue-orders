import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error('La variable d\'environnement JWT_SECRET est requise');
}

export async function signToken(payload: Record<string, unknown>): Promise<string> {
  try {
    const secret = new TextEncoder().encode(jwtSecret);
    return await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(secret);
  } catch (error) {
    console.error('Erreur lors de la signature du token:', error);
    throw new Error('Erreur lors de la génération du token JWT');
  }
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  try {
    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch (error) {
    console.error('Erreur lors de la vérification du token:', error);
    throw new Error('Token JWT invalide ou expiré');
  }
}
