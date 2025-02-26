import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { UserRole } from '../../types';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: string;
}

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { isAuthenticated, user, checkAuth } = useAuthStore();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const verifyAuth = async () => {
      setIsChecking(true);
      try {
        const isValid = await checkAuth();
        
        // Vérifier si l'utilisateur a le rôle requis (si spécifié)
        // Les administrateurs ont accès à toutes les routes
        const hasRequiredRole = !requiredRole || 
                               (user && (user.role === requiredRole || user.role === UserRole.ADMIN));
        
        setIsAuthorized(isValid && hasRequiredRole);
      } catch (error) {
        setIsAuthorized(false);
      } finally {
        setIsChecking(false);
      }
    };

    verifyAuth();
  }, [checkAuth, requiredRole, user]);

  if (isChecking) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-main"></div>
      </div>
    );
  }

  if (!isAuthorized) {
    // Rediriger vers la page de connexion avec l'URL actuelle comme "from" pour rediriger après connexion
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute; 