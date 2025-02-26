import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface LocationState {
  from?: {
    pathname: string;
  };
}

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const { login, isLoading, error, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Récupérer l'URL de redirection après connexion (priorité: state, query param, default)
  const locationState = location.state as LocationState;
  const queryParams = new URLSearchParams(location.search);
  const redirectParam = queryParams.get('redirect');
  const from = locationState?.from?.pathname || redirectParam || '/';

  // Rediriger si déjà connecté
  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    // Validation basique
    if (!email || !password) {
      setFormError('Veuillez remplir tous les champs');
      return;
    }

    try {
      await login(email, password);
      // Rediriger vers la page précédente ou la page admin par défaut
      navigate(from, { replace: true });
    } catch (error: any) {
      // L'erreur est déjà gérée dans le store
      console.error('Erreur de connexion:', error);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="mt-8 flex flex-col items-center">
        <div className="bg-white p-8 w-full rounded-lg shadow-md">
          <h1 className="text-2xl font-medium text-center mb-4">
            Connexion
          </h1>
          
          {(error || formError) && (
            <div className="mb-4 p-4 text-red-700 bg-red-100 rounded-md">
              {formError || error}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="mt-4">
            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Adresse email
              </label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-main focus:border-transparent"
                required
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="mb-6">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Mot de passe
              </label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-main focus:border-transparent"
                required
                name="password"
                type="password"
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 px-4 bg-primary-main hover:bg-primary-dark text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-main disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Chargement...
                </div>
              ) : 'Se connecter'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login; 