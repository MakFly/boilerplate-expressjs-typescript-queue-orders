import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';

const Admin = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Mettre à jour l'heure toutes les secondes
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">
            Tableau de bord administrateur
          </h1>
          <button 
            onClick={handleLogout}
            className="flex items-center text-gray-700 hover:text-red-500"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" aria-hidden="true" />
            <span>Déconnexion</span>
          </button>
        </div>
        
        <p className="mb-2">
          Bienvenue, {user?.email} (Rôle: {user?.role})
        </p>
        
        <p className="text-sm text-gray-500">
          Date et heure actuelles: {currentTime.toLocaleString()}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-md p-4 h-full">
          <h2 className="text-lg font-medium mb-2">
            Statistiques
          </h2>
          <p className="text-sm">
            Cette section affichera les statistiques du système.
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-4 h-full">
          <h2 className="text-lg font-medium mb-2">
            Utilisateurs
          </h2>
          <p className="text-sm">
            Cette section affichera la gestion des utilisateurs.
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-4 h-full">
          <h2 className="text-lg font-medium mb-2">
            Configuration
          </h2>
          <p className="text-sm">
            Cette section affichera les paramètres de configuration.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Admin; 