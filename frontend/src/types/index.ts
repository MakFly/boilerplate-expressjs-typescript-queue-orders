// Types pour les commandes
export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

// Type pour les produits
export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  is_queuable: boolean;
  createdAt: string;
  updatedAt: string;
}

// Enum pour les rôles utilisateur
export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  USER = 'USER'
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
  };
}

export type OrderStatus = 'new' | 'processing' | 'completed' | 'cancelled';

export interface Order {
  id: string;
  orderNumber: string;
  customer: Customer;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  paymentStatus: 'pending' | 'paid' | 'refunded';
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

// Types pour les statistiques
export interface OrderStatusCount {
  status: string;
  count: number;
}

export interface TopProduct {
  productId: string;
  productName: string;
  totalQuantity: number;
}

export interface DailyOrderStats {
  date: string;
  count: number;
  totalAmount: number;
}

export interface OrderStats {
  totalOrders: number;
  ordersByStatus: OrderStatusCount[];
  totalAmount: number;
  averageAmount: number;
  topProducts: TopProduct[];
  ordersByDay: DailyOrderStats[];
}

// Types pour les contextes
export interface OrderContextType {
  orders: Order[];
  stats: OrderStats;
  loading: boolean;
  error: string | null;
  fetchOrders: () => Promise<void>;
  fetchOrderById: (id: string) => Promise<Order | null>;
  updateOrderStatus: (id: string, status: OrderStatus) => Promise<boolean>;
  addOrderNote: (id: string, note: string) => Promise<boolean>;
}

export interface SocketContextType {
  connected: boolean;
  reconnect: () => void;
}

// Types pour les notifications
export interface NotificationProps {
  showNotification: (message: string, severity: 'success' | 'info' | 'warning' | 'error') => void;
}

// Types pour les utilisateurs
export interface User {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
} 