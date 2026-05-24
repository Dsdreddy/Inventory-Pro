export interface Product {
  id: string;
  name: string;
  sku: string;
  description: string;
  imageUrl?: string;
  icon?: string; // e.g. memory, blur_on, memory_alt
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  location: string;
  address: string;
  capacityPercentage: number;
  status: 'Operational' | 'High Load' | 'Maintenance';
}

export interface Stock {
  productId: string;
  warehouseId: string;
  total: number;
  reserved: number;
}

export type ReservationStatus = 'pending' | 'confirmed' | 'released';

export interface Reservation {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: ReservationStatus;
  createdAt: string;
  expiresAt: string;
  idempotencyKey?: string;
}

export interface AuditLog {
  id: string;
  type: 'reserved' | 'confirmed' | 'released' | 'init_transfer' | 'cancelled';
  facilityCode: string;
  clientName: string;
  productName: string;
  quantity: number;
  timestamp: string;
}

export interface DashboardMetrics {
  totalStock: number;
  reservedStock: number;
  availableStock: number;
  activeFacilitiesCount: number;
  totalFacilitiesCount: number;
}
