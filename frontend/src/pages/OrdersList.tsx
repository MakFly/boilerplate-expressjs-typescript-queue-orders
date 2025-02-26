import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  EyeIcon,
  ArrowPathIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { OrderStatus } from '../types';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { orderService } from '../services/api';
import { useQuery } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
  ColumnDef,
} from '@tanstack/react-table';

// Import des composants shadcn/ui
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

// Définition des statuts de commande pour la réutilisation
const ORDER_STATUSES = {
  ALL: 'all',
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
};

// Définition des libellés et couleurs pour chaque statut
const STATUS_CONFIG = {
  [ORDER_STATUSES.PENDING]: { 
    label: 'En attente', 
    badgeVariant: 'secondary',
    priority: 1, // Priorité la plus haute (sera affiché en premier)
  },
  [ORDER_STATUSES.CONFIRMED]: { 
    label: 'Confirmée', 
    badgeVariant: 'default',
    priority: 2,
  },
  [ORDER_STATUSES.DELIVERED]: { 
    label: 'Livrée', 
    badgeVariant: 'success',
    priority: 3,
  },
  [ORDER_STATUSES.CANCELLED]: { 
    label: 'Annulée', 
    badgeVariant: 'destructive',
    priority: 4, // Priorité la plus basse
  },
};

const OrdersList: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Utiliser directement useQuery au lieu du hook personnalisé
  const { 
    data: orders = [], 
    isLoading, 
    error, 
    refetch 
  } = useQuery(['orders', 'list'], () => orderService.getOrders(), {
    // Rafraîchir les données toutes les 30 secondes
    refetchInterval: 30000,
    // Rafraîchir les données lorsque l'onglet redevient actif
    refetchOnWindowFocus: true,
    // Rafraîchir les données lorsque la connexion réseau est rétablie
    refetchOnReconnect: true
  });
  
  // État pour TanStack Table
  const [sorting, setSorting] = useState<SortingState>([{ id: 'status', desc: false }]); // Tri par défaut par statut
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(ORDER_STATUSES.ALL);

  // Statistiques des commandes par statut
  const orderStats = useMemo(() => {
    const stats = {
      [ORDER_STATUSES.ALL]: 0,
      [ORDER_STATUSES.PENDING]: 0,
      [ORDER_STATUSES.CONFIRMED]: 0,
      [ORDER_STATUSES.DELIVERED]: 0,
      [ORDER_STATUSES.CANCELLED]: 0,
    };
    
    orders.forEach(order => {
      stats[ORDER_STATUSES.ALL]++;
      if (stats[order.status] !== undefined) {
        stats[order.status]++;
      }
    });
    
    return stats;
  }, [orders]);

  // Récupérer le filtre de statut depuis l'URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get('status');
    if (status) {
      setStatusFilter(status);
    }
  }, [location.search]);

  const handleViewOrder = (id: string) => {
    navigate(`/orders/${id}`);
  };

  const handleCreateOrder = () => {
    navigate('/orders/create');
  };

  const handleRefresh = () => {
    refetch();
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    
    // Mettre à jour l'URL avec le filtre
    if (value === ORDER_STATUSES.ALL) {
      navigate('/orders');
    } else {
      navigate(`/orders?status=${value}`);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return format(parseISO(dateString), 'dd/MM/yyyy HH:mm', { locale: fr });
  };

  const getStatusChip = (status: string) => {
    const config = STATUS_CONFIG[status] || { label: status, badgeVariant: 'outline' };
    
    return (
      <Badge variant={config.badgeVariant as any}>
        {config.label}
      </Badge>
    );
  };

  // Définition des colonnes pour TanStack Table
  const columnHelper = createColumnHelper<any>();
  
  const columns = useMemo<ColumnDef<any, any>[]>(
    () => [
      columnHelper.accessor('id', {
        header: 'ID Commande',
        cell: info => info.getValue(),
      }),
      columnHelper.accessor('createdAt', {
        header: 'Date',
        cell: info => formatDate(info.getValue()),
      }),
      columnHelper.accessor('user', {
        header: 'Client',
        cell: info => (
          <div>
            <div>{info.getValue()?.name || 'Client inconnu'}</div>
            <div className="text-xs text-muted-foreground/70">
              {info.getValue()?.email || ''}
            </div>
          </div>
        ),
      }),
      columnHelper.accessor('totalAmount', {
        header: 'Montant',
        cell: info => formatCurrency(info.getValue()),
      }),
      columnHelper.accessor('status', {
        header: 'Statut',
        cell: info => getStatusChip(info.getValue()),
        filterFn: (row, columnId, filterValue) => {
          if (filterValue === ORDER_STATUSES.ALL) return true;
          return row.getValue(columnId) === filterValue;
        },
        sortingFn: (rowA, rowB, columnId) => {
          const statusA = rowA.getValue(columnId);
          const statusB = rowB.getValue(columnId);
          
          // Utiliser la priorité définie dans STATUS_CONFIG pour le tri
          const priorityA = STATUS_CONFIG[statusA]?.priority || 999;
          const priorityB = STATUS_CONFIG[statusB]?.priority || 999;
          
          return priorityA - priorityB;
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: props => (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleViewOrder(props.row.original.id)}
              className="text-primary hover:text-primary/80"
            >
              <EyeIcon className="h-5 w-5" />
            </Button>
          </div>
        ),
      }),
    ],
    []
  );

  // Filtrer les données en fonction du statut
  const filteredData = useMemo(() => {
    return orders.filter(order => 
      statusFilter === ORDER_STATUSES.ALL || order.status === statusFilter
    );
  }, [orders, statusFilter]);

  // Configuration de la table
  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3">
        <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Erreur!</strong>
          <span className="block sm:inline">{error instanceof Error ? error.message : "Une erreur s'est produite lors du chargement des commandes"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">
          Liste des Commandes
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleCreateOrder}
            className="flex items-center gap-1"
          >
            Nouvelle commande
          </Button>
          <Button
            variant="outline"
            onClick={handleRefresh}
            className="flex items-center gap-1"
          >
            <ArrowPathIcon className="h-5 w-5" />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Cartes de statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orderStats[ORDER_STATUSES.ALL]}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">En attente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orderStats[ORDER_STATUSES.PENDING]}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Confirmées</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orderStats[ORDER_STATUSES.CONFIRMED]}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Annulées</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orderStats[ORDER_STATUSES.CANCELLED]}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres rapides */}
      <div className="flex flex-col space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button 
            variant={statusFilter === ORDER_STATUSES.ALL ? "default" : "outline"}
            size="sm"
            onClick={() => handleStatusFilterChange(ORDER_STATUSES.ALL)}
            className="flex items-center gap-1"
          >
            <FunnelIcon className="h-4 w-4" />
            Toutes ({orderStats[ORDER_STATUSES.ALL]})
          </Button>
          <Button 
            variant={statusFilter === ORDER_STATUSES.PENDING ? "default" : "outline"}
            size="sm"
            onClick={() => handleStatusFilterChange(ORDER_STATUSES.PENDING)}
            className="flex items-center gap-1"
          >
            En attente ({orderStats[ORDER_STATUSES.PENDING]})
          </Button>
          <Button 
            variant={statusFilter === ORDER_STATUSES.CONFIRMED ? "default" : "outline"}
            size="sm"
            onClick={() => handleStatusFilterChange(ORDER_STATUSES.CONFIRMED)}
            className="flex items-center gap-1"
          >
            Confirmées ({orderStats[ORDER_STATUSES.CONFIRMED]})
          </Button>
          <Button 
            variant={statusFilter === ORDER_STATUSES.DELIVERED ? "default" : "outline"}
            size="sm"
            onClick={() => handleStatusFilterChange(ORDER_STATUSES.DELIVERED)}
            className="flex items-center gap-1"
          >
            Livrées ({orderStats[ORDER_STATUSES.DELIVERED]})
          </Button>
          <Button 
            variant={statusFilter === ORDER_STATUSES.CANCELLED ? "default" : "outline"}
            size="sm"
            onClick={() => handleStatusFilterChange(ORDER_STATUSES.CANCELLED)}
            className="flex items-center gap-1"
          >
            Annulées ({orderStats[ORDER_STATUSES.CANCELLED]})
          </Button>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-grow">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <Input
              type="text"
              placeholder="Rechercher..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={handleStatusFilterChange}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrer par statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ORDER_STATUSES.ALL}>Tous les statuts</SelectItem>
              <SelectItem value={ORDER_STATUSES.PENDING}>En attente</SelectItem>
              <SelectItem value={ORDER_STATUSES.CONFIRMED}>Confirmées</SelectItem>
              <SelectItem value={ORDER_STATUSES.DELIVERED}>Livrées</SelectItem>
              <SelectItem value={ORDER_STATUSES.CANCELLED}>Annulées</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : (
                      <div
                        className={`flex items-center ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''}`}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {{
                          asc: <ChevronUpIcon className="ml-1 h-4 w-4" />,
                          desc: <ChevronDownIcon className="ml-1 h-4 w-4" />,
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center">
                  Aucune commande trouvée
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between space-x-2 py-4">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            Page{' '}
            <span className="font-medium">{table.getState().pagination.pageIndex + 1}</span>{' '}
            sur{' '}
            <span className="font-medium">{table.getPageCount()}</span>
          </p>
          <Select
            value={table.getState().pagination.pageSize.toString()}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger className="h-8 w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 50].map(pageSize => (
                <SelectItem key={pageSize} value={pageSize.toString()}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">par page</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            {'<<'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            {'<'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            {'>'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            {'>>'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OrdersList; 