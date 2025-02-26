import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';
import { User, UserRole } from '../types';

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  lastAuthCheck: number | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
  clearStorage: () => void;
}

// Durée de validité du cache en millisecondes (5 minutes)
const AUTH_CACHE_DURATION = 5 * 60 * 1000;

// Fonction pour convertir la chaîne de caractères du rôle en enum UserRole
const mapRoleToEnum = (role: string): UserRole => {
  switch(role.toUpperCase()) {
    case 'ADMIN':
      return UserRole.ADMIN;
    case 'MANAGER':
      return UserRole.MANAGER;
    default:
      return UserRole.USER;
  }
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      lastAuthCheck: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post('/auth/login', { email, password });
          const { token, user } = response.data;
          
          // Configurer le token dans les en-têtes pour les futures requêtes
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          
          // Convertir le rôle en enum
          const userWithEnumRole = {
            ...user,
            role: mapRoleToEnum(user.role)
          };
          
          set({ 
            token, 
            user: userWithEnumRole, 
            isAuthenticated: true, 
            isLoading: false,
            lastAuthCheck: Date.now()
          });
        } catch (error: any) {
          set({ 
            isLoading: false, 
            error: error.response?.data?.message || 'Échec de connexion' 
          });
          throw error;
        }
      },

      logout: () => {
        // Supprimer le token des en-têtes
        delete api.defaults.headers.common['Authorization'];
        
        set({ 
          token: null, 
          user: null, 
          isAuthenticated: false,
          lastAuthCheck: null
        });
      },

      // Fonction pour effacer complètement le localStorage et forcer une nouvelle connexion
      clearStorage: () => {
        // Supprimer le token des en-têtes
        delete api.defaults.headers.common['Authorization'];
        
        // Effacer le localStorage
        localStorage.removeItem('auth-storage');
        
        set({ 
          token: null, 
          user: null, 
          isAuthenticated: false,
          lastAuthCheck: null
        });
      },

      checkAuth: async () => {
        const { token, lastAuthCheck, user, isAuthenticated } = get();
        
        // Si pas de token, l'utilisateur n'est pas authentifié
        if (!token) return false;
        
        // Si déjà authentifié et vérification récente, retourner l'état actuel
        const now = Date.now();
        if (isAuthenticated && user && lastAuthCheck && (now - lastAuthCheck < AUTH_CACHE_DURATION)) {
          return true;
        }

        try {
          // Configurer le token dans les en-têtes
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          
          // Utiliser /auth/validate au lieu de /auth/me pour une vérification légère
          // Cette route vérifie juste la validité du token sans charger toutes les données utilisateur
          await api.get('/auth/validate');
          
          // Mettre à jour le timestamp de dernière vérification
          set({ 
            isAuthenticated: true,
            lastAuthCheck: now
          });
          
          // Si l'utilisateur n'est pas encore chargé ou si le cache est expiré, charger les données utilisateur
          if (!user || !lastAuthCheck || (now - lastAuthCheck >= AUTH_CACHE_DURATION)) {
            try {
              const response = await api.get('/auth/me');
              
              // Convertir le rôle en enum
              const userWithEnumRole = {
                ...response.data,
                role: mapRoleToEnum(response.data.role)
              };
              
              set({ user: userWithEnumRole });
            } catch (error) {
              // En cas d'erreur lors du chargement des données utilisateur, on garde l'utilisateur connecté
              // mais on ne met pas à jour ses données
              console.error("Erreur lors du chargement des données utilisateur:", error);
            }
          }
          
          return true;
        } catch (error) {
          // Si le token n'est pas valide, déconnecter l'utilisateur
          get().logout();
          return false;
        }
      }
    }),
    {
      name: 'auth-storage', // nom du stockage dans localStorage
      partialize: (state) => ({ 
        token: state.token, 
        user: state.user,
        lastAuthCheck: state.lastAuthCheck
      }), // ne stocker que ces champs
      onRehydrateStorage: () => (state) => {
        // Ajouter des logs pour le débogage
        console.log('État réhydraté:', state);
        
        // Migrer les données existantes pour utiliser l'enum UserRole
        if (state && state.user && state.user.role) {
          console.log('Rôle avant conversion:', state.user.role, typeof state.user.role);
          
          // Forcer la conversion du rôle en enum, qu'il soit déjà un enum ou une chaîne
          if (typeof state.user.role === 'string') {
            state.user.role = mapRoleToEnum(state.user.role);
          } else {
            // Si c'est déjà un objet (peut arriver avec la sérialisation), utiliser la valeur
            const roleValue = String(state.user.role);
            state.user.role = mapRoleToEnum(roleValue);
          }
          
          console.log('Rôle après conversion:', state.user.role, typeof state.user.role);
        }
      }
    }
  )
); 