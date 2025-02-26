import api from './api';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

const authService = {
  // Connexion utilisateur
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  // Récupérer les informations de l'utilisateur connecté
  async getCurrentUser() {
    const response = await api.get('/auth/me');
    return response.data;
  },

  // Vérifier si le token est valide
  async validateToken(token: string) {
    try {
      const response = await api.get('/auth/validate', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      return response.data;
    } catch (error) {
      return null;
    }
  }
};

export default authService; 