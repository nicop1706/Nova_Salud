export type Role = 'ADMIN' | 'SELLER' | 'WAREHOUSE';
export type PaymentMethod = 'CASH' | 'CARD' | 'YAPE' | 'PLIN';
export type StockStatus = 'OUT' | 'LOW' | 'OK';

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  active?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface Paged<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; completedTotal?: number };
}

export interface Category {
  id: number;
  name: string;
  description: string | null;
  productCount: number;
}

export interface Supplier {
  id: number;
  name: string;
  ruc: string | null;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
  productCount: number;
}

export interface Product {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  activeIngredient: string | null;
  laboratory: string | null;
  presentation: string | null;
  categoryId: number;
  categoryName?: string;
  supplierId: number | null;
  supplierName?: string | null;
  purchasePrice?: number; // no se envía al vendedor
  salePrice: number;
  minStock: number;
  requiresPrescription: boolean;
  active: boolean;
  availableStock: number;
  totalStock: number;
  expiredStock: number;
  nextExpiry: string | null;
  stockStatus: StockStatus;
  daysToExpiry: number | null;
}

export interface Batch {
  id: number;
  productId: number;
  batchNumber: string;
  expiresAt: string;
  quantity: number;
  initialQty: number;
  receivedAt: string;
  daysToExpiry: number;
  expired: boolean;
}
export interface BatchRow extends Batch {
  productName: string;
  productSku: string;
  presentation: string | null;
  purchasePrice: number;
}
export interface ProductDetail extends Product {
  batches: Batch[];
}

export interface Customer {
  id: number;
  docType: 'DNI' | 'RUC' | 'CE';
  docNumber: string;
  name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  purchases?: number;
  totalSpent?: number;
  lastPurchaseAt?: string | null;
}
export interface FrequentProduct {
  id: number;
  name: string;
  sku: string;
  presentation: string | null;
  salePrice: number;
  requiresPrescription: boolean;
  totalQty: number;
  times: number;
  availableStock: number;
}
export interface CustomerDetail {
  customer: Customer;
  history: Array<{ id: number; number: number; status: string; total: number; paymentMethod: PaymentMethod; completedAt: string; sellerName: string; summary: string }>;
  frequent: FrequentProduct[];
}

export interface SaleRow {
  id: number;
  number: number;
  status: 'COMPLETED' | 'VOIDED';
  paymentMethod: PaymentMethod;
  subtotal: number;
  igv: number;
  discount: number;
  total: number;
  completedAt: string;
  serviceSeconds: number | null;
  sellerName: string;
  customerName: string | null;
  customerDoc: string | null;
  itemsCount: number;
}
export interface SaleDetail {
  id: number;
  number: number;
  status: 'COMPLETED' | 'VOIDED';
  paymentMethod: PaymentMethod;
  subtotal: number;
  igv: number;
  discount: number;
  total: number;
  cashReceived: number | null;
  changeGiven: number | null;
  prescriptionChecked: boolean;
  completedAt: string;
  serviceSeconds: number | null;
  voidedAt: string | null;
  voidReason: string | null;
  voidedByName: string | null;
  sellerName: string;
  customerName: string | null;
  customerDoc: string | null;
  items: Array<{
    id: number;
    productId: number;
    name: string;
    sku: string;
    presentation: string | null;
    quantity: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
    batches: Array<{ batchId: number; batchNumber: string; expiresAt: string; quantity: number }>;
  }>;
}

export type AlertType = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'EXPIRING' | 'EXPIRED';
export type AlertPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM';
export interface AlertRow {
  id: number;
  type: AlertType;
  priority: AlertPriority;
  status: 'OPEN' | 'RESOLVED';
  message: string;
  openedAt: string;
  productId: number;
  batchId: number | null;
  productName: string;
  productSku: string;
  batchNumber: string | null;
}
export interface AlertSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  byType: Record<AlertType, number>;
}

export interface ReplenishmentLine {
  productId: number;
  sku: string;
  name: string;
  presentation: string | null;
  available: number;
  minStock: number;
  sold30: number;
  dailyRate: number;
  suggestedQty: number;
  unitCost: number;
  lineCost: number;
}
export interface Replenishment {
  generatedAt: string;
  coverageDays: number;
  totalCost: number;
  totalLines: number;
  groups: Array<{ supplierId: number | null; supplierName: string; contact?: string | null; phone?: string | null; email?: string | null; totalCost: number; lines: ReplenishmentLine[] }>;
}

export interface KardexRow {
  id: number;
  productId: number;
  productName: string;
  productSku: string;
  batchNumber: string | null;
  type: string;
  quantity: number;
  unitCost: number | null;
  reason: string | null;
  reference: string | null;
  balance: number | null;
  userName: string | null;
  createdAt: string;
}

export interface StockCountSummary {
  id: number;
  status: 'OPEN' | 'APPLIED' | 'CANCELLED';
  notes: string | null;
  createdAt: string;
  appliedAt: string | null;
  createdByName: string;
  items: number;
  counted: number;
  differences: number;
}
export interface StockCountDetail {
  id: number;
  status: 'OPEN' | 'APPLIED' | 'CANCELLED';
  notes: string | null;
  createdAt: string;
  appliedAt: string | null;
  createdByName: string;
  items: Array<{ productId: number; name: string; sku: string; presentation: string | null; purchasePrice: number; systemQty: number; countedQty: number | null; difference: number | null }>;
}

export interface Dashboard {
  today: string;
  sales: { day: { count: number; total: number }; week: { count: number; total: number }; month: { count: number; total: number }; avgTicketMonth: number; avgTicketDay: number };
  avgServiceSeconds: number | null;
  daily: Array<{ day: string; sales: number; total: number }>;
  topProducts: Array<{ id: number; name: string; units: number; revenue: number }>;
  criticalStock: Array<{ id: number; type: AlertType; priority: AlertPriority; productId: number; name: string; minStock: number; available: number }>;
  expiring: Array<{ id: number; type: AlertType; priority: AlertPriority; name: string; batchNumber: string; expiresAt: string; quantity: number }>;
  alerts: AlertSummary;
  expiryDays: number[];
  payments: Array<{ method: PaymentMethod; count: number; total: number }>;
}

export interface Indicators {
  days: number;
  salesCount: number;
  service: { avgSeconds: number | null; medianSeconds: number | null; maxSeconds: number | null; measuredSales: number; daily: Array<{ day: string; avgSeconds: number; sales: number }> };
  stockouts: {
    events: number;
    productsAffected: number;
    salesWithoutStockoutPct: number;
    currentOutOfStock: number;
    activeProducts: number;
    stockoutRatePct: number;
    topProducts: Array<{ id: number; name: string; events: number; missingUnits: number }>;
  };
  inventoryAccuracy: {
    counts: Array<{ id: number; appliedAt: string; counted: number; withDifference: number; absUnits: number; systemUnits: number; netValue: number; absValue: number; accuracyPct: number }>;
    latest: { id: number; appliedAt: string; counted: number; withDifference: number; absUnits: number; systemUnits: number; netValue: number; absValue: number; accuracyPct: number } | null;
  };
  expiryWaste: { units: number; value: number; top: Array<{ name: string; units: number; value: number }> };
  rotation: { cogs: number; inventoryValue: number; turnover: number; annualized: number; daysOfInventory: number | null };
}

export interface ReportDataset {
  key: string;
  title: string;
  subtitle: string;
  columns: Array<{ key: string; label: string; type: 'text' | 'int' | 'money' | 'datetime' | 'date' | 'number'; width?: number }>;
  rows: Array<Record<string, string | number | null>>;
  totals?: Record<string, string | number | null>;
  totalRows: number;
  truncated: boolean;
}

export interface AuditRow {
  id: number;
  action: string;
  entity: string;
  entityId: string | null;
  detail: unknown;
  ip: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

export interface ImportResult {
  dryRun: boolean;
  totalRows: number;
  created: number;
  updated: number;
  errors: Array<{ row: number; message: string }>;
}
