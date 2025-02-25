/**
 * Configuration globale de l'application
 */
export const config = {
  jwt: {
    secret: process.env.JWT_SECRET || 'default_secret_key',
    expiresIn: '24h'
  },
  // Autres configurations peuvent être ajoutées ici
}; 