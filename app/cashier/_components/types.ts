import type {
  BorrowedGallonStatus,
  DeliveryOrderType,
  DeliveryPaymentMethod,
  DeliveryPaymentStatus,
  DeliveryStatus,
  GallonMovementType,
  PosPaymentMethod,
  PosProductCategory,
  PosSaleStatus,
  UserRole,
  VendoPeriodType,
} from "@/backend/db/types";

export type {
  BorrowedGallonStatus,
  DeliveryOrderType,
  DeliveryPaymentMethod,
  DeliveryPaymentStatus,
  DeliveryStatus,
  GallonMovementType,
  PosPaymentMethod,
  PosProductCategory,
  PosSaleStatus,
  UserRole,
  VendoPeriodType,
};

export function formatPHP(amount: number): string {
  return `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface StationOptionDTO {
  id: string;
  email: string;
  fullName: string | null;
}

export interface PosProductDTO {
  id: string;
  name: string;
  category: PosProductCategory;
  unit_price: number;
  is_active: boolean;
}

export interface PosSaleItemDTO {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  category: PosProductCategory;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface PosSaleDTO {
  id: string;
  receipt_no: string;
  customer_name: string | null;
  payment_method: PosPaymentMethod;
  subtotal: number;
  discount: number;
  total_amount: number;
  amount_tendered: number;
  change_amount: number;
  status: PosSaleStatus;
  notes: string | null;
  business_date: string;
  created_at: string;
  items: PosSaleItemDTO[];
}

export interface PosOverviewDTO {
  businessDate: string;
  schemaMissing: boolean;
  products: PosProductDTO[];
  sales: PosSaleDTO[];
  summary: {
    completedCount: number;
    voidedCount: number;
    cashTotal: number;
    digitalTotal: number;
    utangTotal: number;
    grossTotal: number;
    gallonsSold: number;
  };
}

export interface DeliveryCustomerDTO {
  id: string;
  customer_name: string;
  phone: string | null;
  area: string;
  default_unit_price: number;
  gallons_held: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface DeliveryDTO {
  id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  destination: string;
  order_type: DeliveryOrderType;
  quantity: number;
  empty_gallons_returned: number;
  unit_price: number;
  delivery_fee: number;
  total_amount: number;
  payment_method: DeliveryPaymentMethod;
  payment_status: DeliveryPaymentStatus;
  delivery_status: DeliveryStatus;
  borrowed_gallons_count: number;
  delivered_by: string | null;
  notes: string | null;
  business_date: string;
  delivered_at: string | null;
  created_at: string;
}

export interface PeriodDeliveryTallyDTO {
  count: number;
  gallonsOut: number;
  emptiesIn: number;
  netGallons: number;
  totalSales: number;
}

export interface DeliveriesOverviewDTO {
  businessDate: string;
  schemaMissing: boolean;
  customers: DeliveryCustomerDTO[];
  deliveries: DeliveryDTO[];
  tallies: {
    today: PeriodDeliveryTallyDTO;
    week: PeriodDeliveryTallyDTO;
    month: PeriodDeliveryTallyDTO;
  };
  summary: {
    totalDeliveries: number;
    totalGallonsOut: number;
    totalEmptiesIn: number;
    paidCashTotal: number;
    paidCashWaterTotal: number;
    paidCashDeliveryFees: number;
    paidDigitalTotal: number;
    unpaidTotal: number;
    grossActiveTotal: number;
  };
}

export interface VendoCollectionDTO {
  id: string;
  machine_name: string;
  period_type: VendoPeriodType;
  period_start: string;
  period_end: string;
  amount: number;
  meter_start: number | null;
  meter_end: number | null;
  notes: string | null;
  business_date: string;
  created_at: string;
}

export interface VendoOverviewDTO {
  businessDate: string;
  schemaMissing: boolean;
  collections: VendoCollectionDTO[];
  summary: {
    thisMonthTotal: number;
    todayTotal: number;
    yearTotal: number;
    totalEntries: number;
  };
}

export interface GallonStockDTO {
  id: string;
  on_hand_qty: number;
  damaged_qty: number;
  updated_at: string;
}

export interface GallonInventoryLogDTO {
  id: string;
  movement_type: GallonMovementType;
  quantity_delta: number;
  balance_after: number;
  notes: string | null;
  business_date: string;
  created_at: string;
}

export interface BorrowedGallonDTO {
  id: string;
  delivery_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  qty_borrowed: number;
  qty_returned: number;
  deposit_amount: number;
  status: BorrowedGallonStatus;
  borrowed_date: string;
  returned_at: string | null;
  notes: string | null;
}

export interface InventoryOverviewDTO {
  businessDate: string;
  schemaMissing: boolean;
  stock: GallonStockDTO[];
  logs: GallonInventoryLogDTO[];
  borrowedGallons: BorrowedGallonDTO[];
  summary: {
    totalOnHand: number;
    totalDamaged: number;
    currentlyBorrowedOut: number;
    activeBorrowers: number;
  };
}

export interface ShiftClosingDTO {
  id: string;
  business_date: string;
  shift_label: string;
  opening_cash: number;
  walkin_cash_sales: number;
  walkin_digital_sales: number;
  delivery_cash_sales: number;
  delivery_digital_sales: number;
  delivery_unpaid_total: number;
  vendo_daily_income: number;
  expected_cash: number;
  actual_cash: number;
  variance: number;
  total_gross_sales: number;
  walkin_count: number;
  delivery_count: number;
  notes: string | null;
  closed_at: string;
}

export interface ShiftClosingOverviewDTO {
  businessDate: string;
  schemaMissing: boolean;
  liveTally: {
    walkinCashSales: number;
    walkinDigitalSales: number;
    walkinUtangSales: number;
    walkinCount: number;
    deliveryCashSales: number;
    deliveryWaterCashSales: number;
    deliveryFeeCashSales: number;
    deliveryDigitalSales: number;
    deliveryUnpaidTotal: number;
    deliveryCount: number;
    vendoDailyIncome: number;
    totalCashCollected: number;
    totalDigitalCollected: number;
    totalGrossSales: number;
    deliveryStats: {
      today: PeriodDeliveryTallyDTO;
      week: PeriodDeliveryTallyDTO;
      month: PeriodDeliveryTallyDTO;
    };
  };
  history: ShiftClosingDTO[];
}
