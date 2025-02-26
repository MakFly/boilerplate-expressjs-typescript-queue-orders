// Définition locale de OrderStatus car n'existe pas dans @prisma/client
export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELED = 'CANCELED'
}

export interface OrderItem {
  productId: string;
  quantity: number;
  price?: number;
}

export interface CreateOrderInput {
  userId: string;
  items: OrderItem[];
  notes?: string;
}

export interface UpdateOrderInput {
  status?: OrderStatus;
  cancellationReason?: string | null;
  userId?: string;
  items?: OrderItem[];
  notes?: string;
}

export interface OrderFilters {
  status?: OrderStatus | OrderStatus[];
  userId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
} 