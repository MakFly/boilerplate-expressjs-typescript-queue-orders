import React, { useEffect, useState } from 'react';
import {
  Bars3BottomRightIcon,
  ShoppingCartIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  UserIcon,
  ArchiveBoxIcon,
} from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useAuthStore } from '../store/authStore';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { UserRole, OrderStats } from '../types';
import { useQuery } from '@tanstack/react-query';
import { orderService } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

// Composant pour afficher une statistique
interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, onClick, subtitle }) => (
  <div 
    className={`bg-card p-6 rounded-lg shadow-md border-2 border-border flex flex-col h-40 relative overflow-hidden transition-all duration-200 ${onClick ? 'cursor-pointer hover:shadow-lg hover:-translate-y-1' : ''}`}
    onClick={onClick}
  >
    <div 
      className="absolute -top-5 -right-5 w-24 h-24 rounded-full flex justify-center items-center opacity-20"
      style={{ backgroundColor: color }}
    >
      <div className="text-2xl" style={{ color }}>
        {icon}
      </div>
    </div>
    <h2 className="text-base font-medium text-muted-foreground mb-2">
      {title}
    </h2>
    <p className="text-3xl font-bold mt-1 text-foreground">
      {value}
    </p>
    {subtitle && (
      <p className="text-sm text-muted-foreground mt-auto">
        {subtitle}
      </p>
    )}
  </div>
);

const Dashboard: React.FC = () => {
  const { connected, reconnect } = useSocket();
  const { user, clearStorage } = useAuthStore();
  const navigate = useNavigate();
  const [todayOrders, setTodayOrders] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);

  // Utiliser TanStack Query pour récupérer les statistiques
  const { 
    data: stats,
    isLoading: loading, 
    error: queryError, 
    refetch 
  } = useQuery<OrderStats>(['orders', 'stats'], async () => {
    console.log('Fetching order stats...');
    try {
      const response = await orderService.getOrderStats();
      console.log('Order stats response:', response);
      return response;
    } catch (error) {
      console.error('Error fetching order stats:', error);
      throw error;
    }
  }, {
    // Ne pas exécuter la requête si l'utilisateur n'a pas les droits
    enabled: !!user && (user.role === UserRole.ADMIN || user.role === UserRole.MANAGER),
    // Rafraîchir les données toutes les 30 secondes
    refetchInterval: 30000,
    // Rafraîchir les données lorsque l'onglet redevient actif
    refetchOnWindowFocus: true,
    // Rafraîchir les données lorsque la connexion réseau est rétablie
    refetchOnReconnect: true,
    onSuccess: (data) => {
      console.log('Query succeeded with data:', data);
    },
    onError: (error) => {
      console.error('Query failed with error:', error);
    }
  });

  // Calculer les commandes et revenus du jour
  useEffect(() => {
    console.log('Stats changed:', stats);
    if (stats?.ordersByDay) {
      const today = new Date().toISOString().split('T')[0];
      const todayStats = stats.ordersByDay.find(day => day.date === today);
      
      if (todayStats) {
        setTodayOrders(todayStats.count);
        setTodayRevenue(todayStats.totalAmount);
      } else {
        setTodayOrders(0);
        setTodayRevenue(0);
      }
    }
  }, [stats]);

  // Vérifier si l'utilisateur a le rôle admin ou manager en utilisant l'enum
  const hasAdminAccess = user && (
    user.role === UserRole.ADMIN || 
    user.role === UserRole.MANAGER
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const handleRefresh = () => {
    console.log('Refreshing data...');
    refetch();
  };

  const handleClearStorage = () => {
    clearStorage();
    navigate('/login');
  };

  const today = format(new Date(), 'EEEE d MMMM yyyy', { locale: fr });
  const time = format(new Date(), 'HH:mm:ss');

  // Obtenir les statuts des commandes et leurs compteurs
  const getOrderStatusCount = (status: string) => {
    if (!stats?.ordersByStatus) return 0;
    const statusItem = stats.ordersByStatus.find(item => item.status === status);
    return statusItem ? statusItem.count : 0;
  };

  console.log('Current user:', user);
  console.log('Has admin access:', hasAdminAccess);
  console.log('Loading state:', loading);
  console.log('Stats data:', stats);
  console.log('Query error:', queryError);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  const error = queryError instanceof Error ? queryError.message : undefined;

  return (
    <div className="flex-grow">
      <div className="p-6 mb-8 rounded-lg shadow-md bg-gradient-to-r from-primary to-primary/80 border-2 border-primary/30">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Tableau de bord
            </h1>
            <p className="text-white opacity-90">
              {today} - {time}
            </p>
          </div>
          <div className="flex items-center">
            <div className="mr-4 bg-card px-3 py-1 rounded-full flex items-center text-foreground border-2 border-border">
              <UserIcon className="h-5 w-5 text-primary mr-2" />
              <span>{`${user?.name || user?.email} (${user?.role})`}</span>
            </div>
            <button
              className="mr-2 bg-card text-primary px-4 py-2 rounded-md hover:bg-accent flex items-center border-2 border-border"
              onClick={handleRefresh}
            >
              <Bars3BottomRightIcon className="h-5 w-5 mr-2" />
              Actualiser
            </button>
            {!connected && (
              <button
                className="mr-2 bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600 font-bold border-2 border-red-600"
                onClick={reconnect}
              >
                Reconnecter
              </button>
            )}
            <button
              className="bg-card text-red-500 border-2 border-red-500 px-4 py-2 rounded-md hover:bg-accent font-bold"
              onClick={handleClearStorage}
            >
              Réinitialiser
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-2 border-red-300 dark:border-red-800 rounded-md">
          {error}
        </div>
      )}

      {user?.role === UserRole.ADMIN && !stats && (
        <div className="mb-6 p-4 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-2 border-yellow-300 dark:border-yellow-800 rounded-md flex justify-between items-center">
          <span>Vous êtes connecté en tant qu'administrateur mais vous n'avez pas accès aux données. Cela peut être dû à un problème de session. Essayez de réinitialiser votre session.</span>
          <button 
            className="ml-4 px-3 py-1 bg-yellow-200 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-300 rounded-md hover:bg-yellow-300 dark:hover:bg-yellow-700 border-2 border-yellow-400 dark:border-yellow-700"
            onClick={handleClearStorage}
          >
            Réinitialiser
          </button>
        </div>
      )}

      {stats && (
        <>
          <div className="mb-8">
            <h2 className="text-xl font-medium mb-2 text-foreground">
              Aperçu des commandes
            </h2>
            <div className="border-b border-border mb-6"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              {/* Commandes totales */}
              <StatCard
                title="Commandes totales"
                value={stats.totalOrders}
                icon={<ShoppingCartIcon className="h-6 w-6" />}
                color="#1976d2"
                onClick={() => navigate('/orders')}
                subtitle="Toutes les commandes"
              />
              
              {/* Commandes du jour */}
              <StatCard
                title="Commandes aujourd'hui"
                value={todayOrders}
                icon={<ShoppingCartIcon className="h-6 w-6" />}
                color="#2196f3"
                subtitle="Commandes du jour"
              />
              
              {/* Montant total */}
              <StatCard
                title="Montant total"
                value={formatCurrency(stats.totalAmount)}
                icon={<CurrencyDollarIcon className="h-6 w-6" />}
                color="#4caf50"
                subtitle="Toutes les commandes"
              />
              
              {/* Montant moyen */}
              <StatCard
                title="Montant moyen"
                value={formatCurrency(stats.averageAmount)}
                icon={<ArrowTrendingUpIcon className="h-6 w-6" />}
                color="#ff9800"
                subtitle="Par commande"
              />
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-medium mb-2 text-foreground">
              Statut des commandes
            </h2>
            <div className="border-b border-border mb-6"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              {stats.ordersByStatus && stats.ordersByStatus.length > 0 ? (
                stats.ordersByStatus.map((statusItem, index) => {
                  let icon = <ClockIcon className="h-6 w-6" />;
                  let color = "#ff9800";
                  
                  if (statusItem.status === "CONFIRMED") {
                    icon = <CheckCircleIcon className="h-6 w-6" />;
                    color = "#4caf50";
                  } else if (statusItem.status === "CANCELLED") {
                    icon = <XCircleIcon className="h-6 w-6" />;
                    color = "#f44336";
                  } else if (statusItem.status === "PROCESSING") {
                    icon = <ArrowTrendingUpIcon className="h-6 w-6" />;
                    color = "#2196f3";
                  }
                  
                  return (
                    <StatCard
                      key={index}
                      title={`Commandes ${statusItem.status}`}
                      value={statusItem.count}
                      icon={icon}
                      color={color}
                      onClick={() => navigate('/orders')}
                      subtitle={`Statut: ${statusItem.status}`}
                    />
                  );
                })
              ) : (
                <div className="col-span-4 text-center p-4 bg-accent/50 border border-border rounded-md text-foreground">
                  Aucune donnée de statut disponible
                </div>
              )}
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-medium mb-2 text-foreground">
              Produits les plus vendus
            </h2>
            <div className="border-b border-border mb-6"></div>
            {stats.topProducts && stats.topProducts.length > 0 ? (
              <div className="bg-card rounded-lg shadow-md border-2 border-border overflow-hidden mb-8">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Produit</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Quantité vendue</th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {stats.topProducts.map((product) => (
                      <tr key={product.productId} className="hover:bg-accent/50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                          {product.productName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground text-right">
                          {product.totalQuantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center p-4 bg-accent/50 border-2 border-border rounded-md text-foreground">
                Aucun produit vendu disponible
              </div>
            )}
          </div>

          {stats.ordersByDay && stats.ordersByDay.length > 0 ? (
            // <div className="mb-8">
            //   <h2 className="text-xl font-medium mb-2 text-foreground">
            //     Évolution des commandes et revenus
            //   </h2>
            //   <div className="border-b border-border mb-6"></div>
            //   <div className="bg-card p-6 rounded-lg shadow-md border-2 border-border">
            //     <ResponsiveContainer width="100%" height={300}>
            //       <BarChart
            //         data={stats.ordersByDay}
            //         margin={{
            //           top: 5,
            //           right: 30,
            //           left: 20,
            //           bottom: 5,
            //         }}
            //       >
            //         <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            //         <XAxis dataKey="date" stroke="var(--foreground)" />
            //         <YAxis stroke="var(--foreground)" />
            //         <Tooltip 
            //           formatter={(value, name) => {
            //             if (name === "totalAmount") return formatCurrency(Number(value));
            //             return value;
            //           }}
            //           labelFormatter={(label) => `Date: ${label}`}
            //           contentStyle={{
            //             backgroundColor: 'var(--card)',
            //             color: 'var(--foreground)',
            //             border: '1px solid var(--border)'
            //           }}
            //         />
            //         <Legend wrapperStyle={{ color: 'var(--foreground)' }} />
            //         <Bar name="Nombre de commandes" dataKey="count" fill="#8884d8" />
            //         <Bar name="Montant total" dataKey="totalAmount" fill="#82ca9d" />
            //       </BarChart>
            //     </ResponsiveContainer>
            //   </div>
            // </div>
            <></>
          ) : (
            <div className="mb-8">
              <h2 className="text-xl font-medium mb-2 text-foreground">
                Évolution des commandes et revenus
              </h2>
              <div className="border-b border-border mb-6"></div>
              <div className="text-center p-4 bg-accent/50 border-2 border-border rounded-md text-foreground">
                Aucune donnée d'évolution disponible
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard; 