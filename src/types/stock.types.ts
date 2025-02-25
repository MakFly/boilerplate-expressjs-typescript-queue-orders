import { StockAlertType, StockAlertSeverity } from '@prisma/client';

/**
 * Interface pour les métadonnées des alertes de stock
 * Standardise la structure des métadonnées selon le type d'alerte
 */
export interface StockAlertMetadata {
    // Métadonnées communes à tous les types d'alertes
    timestamp: string;
    message: string;
    severity?: StockAlertSeverity;
    
    // Métadonnées de lecture
    read?: boolean;
    readAt?: string;
    
    // Métadonnées spécifiques aux alertes de stock bas
    threshold?: number;
    currentStock?: number;
    previousStock?: number;
    
    // Métadonnées spécifiques aux alertes de commande en file d'attente
    queuePosition?: number;
    queuedAt?: string;
    estimatedProcessingTime?: string;
    
    // Métadonnées spécifiques aux alertes de commande traitée
    processedAt?: string;
    processedBy?: string;
    validatedAt?: string;
    validationType?: 'MANUAL' | 'AUTOMATIC';
    
    // Métadonnées spécifiques aux alertes d'échec de commande
    reason?: string;
    requestedQuantity?: number;
    availableStock?: number;
    
    // Métadonnées supplémentaires
    previousType?: StockAlertType;
    [key: string]: any;
}

/**
 * Interface pour la création d'une alerte de stock
 */
export interface CreateStockAlertDto {
    type: StockAlertType;
    quantity: number;
    productId: string;
    orderId?: string;
    metadata?: Partial<StockAlertMetadata>;
}

/**
 * Interface pour les notifications d'alerte de stock
 */
export interface StockAlertNotification {
    id: string;
    type: StockAlertType;
    productId: string;
    productName: string;
    message: string;
    severity: StockAlertSeverity;
    timestamp: string;
    read: boolean;
    metadata: any;
}

/**
 * Interface pour les statistiques d'alertes de stock
 */
export interface StockAlertStats {
    totalAlerts: number;
    byType: Record<StockAlertType, number>;
    byProduct: Record<string, number>;
    recentAlerts: number; // Alertes des dernières 24h
    unreadAlerts: number; // Alertes non lues
}

/**
 * Interface pour les paramètres de configuration des alertes de stock
 */
export interface StockAlertConfig {
    lowStockThreshold: number | ((stock: number, quantity: number) => number);
    notificationEnabled: boolean;
    autoProcessing: boolean;
    alertExpirationDays: number;
}

/**
 * Interface pour les options de récupération des alertes
 */
export interface GetAlertsOptions {
    limit: number;
    offset: number;
    filters?: {
        type?: StockAlertType;
        product_id?: string;
        read?: boolean;
        severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    };
}

export interface StockAlertCreate {
  type: StockAlertType;
  productId: string;
  quantity: number;
  orderId?: string;
  metadata: StockAlertMetadata;
}

export interface StockAlert {
  id: string;
  type: StockAlertType;
  productId: string;
  quantity: number;
  orderId?: string;
  createdAt: Date;
  updatedAt: Date;
  read: boolean;
  metadata: StockAlertMetadata;
  severity: StockAlertSeverity;
  message: string;
}

export interface StockAlertNotificationCreate {
  type: StockAlertType;
  productId: string;
  productName: string;
  message: string;
  severity: StockAlertSeverity;
  metadata?: any;
}

export interface StockAlertUpdate {
  type?: StockAlertType;
  quantity?: number;
  read?: boolean;
  metadata?: StockAlertMetadata;
  severity?: StockAlertSeverity;
  message?: string;
}

export interface StockAlertsByProduct {
  productId: string;
  count: number;
}

// Réexporter les énumérations de Prisma pour la compatibilité
export { StockAlertType, StockAlertSeverity }; 