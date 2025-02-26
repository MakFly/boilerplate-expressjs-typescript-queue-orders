import jwt from "jsonwebtoken";

/**
 * Interface pour les données à inclure dans le token
 */
interface TokenPayload {
  email: string;
  [key: string]: any; // Permet d'ajouter d'autres propriétés si nécessaire
}

/**
 * Options de configuration pour la génération du token
 */
const tokenOptions: jwt.SignOptions = {
  expiresIn: "24h", // Durée de validité du token
};

// Clé secrète pour signer les tokens
const JWT_SECRET = process.env.JWT_SECRET || "default_secret_key";

/**
 * Génère un JWT token avec les données fournies
 * @param payload Les données à inclure dans le token
 * @returns Une promesse qui résout avec le token généré
 */
export const signToken = (payload: TokenPayload): Promise<string> => {
  return new Promise((resolve, reject) => {
    jwt.sign(payload, JWT_SECRET, tokenOptions, (err, token) => {
      if (err || !token) {
        reject(new Error("Erreur lors de la génération du token"));
        return;
      }
      resolve(token);
    });
  });
};

/**
 * Vérifie et décode un JWT token
 * @param token Le token à vérifier
 * @returns Une promesse qui résout avec les données décodées du token
 */
export const verifyToken = (token: string): Promise<TokenPayload> => {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      JWT_SECRET,
      (err: jwt.VerifyErrors | null, decoded: any) => {
        if (err || !decoded) {
          reject(new Error("Token invalide ou expiré"));
          return;
        }
        resolve(decoded as TokenPayload);
      }
    );
  });
};
