import type { ExpenseCategory, UserRole } from "@/backend/db/types";
import type {
  OwnerBorrowedItem,
  OwnerChartPoint,
  OwnerCustomerSummary,
  OwnerDashboardSnapshot,
  OwnerExpenseCategorySummary,
  OwnerPendingItem,
  OwnerRangeDays,
  OwnerShiftRow,
  OwnerUnifiedSaleRow,
  OwnerUnpaidBill,
  StationExpenseRow,
} from "@/backend/services/owner/dashboard";

export type {
  ExpenseCategory,
  OwnerBorrowedItem,
  OwnerChartPoint,
  OwnerCustomerSummary,
  OwnerDashboardSnapshot,
  OwnerExpenseCategorySummary,
  OwnerPendingItem,
  OwnerRangeDays,
  OwnerShiftRow,
  OwnerUnifiedSaleRow,
  OwnerUnpaidBill,
  StationExpenseRow,
  UserRole,
};

export interface OwnerStaffProfileDTO {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  is_owner_cashier?: boolean;
  owner_id: string | null;
  created_at: string;
}

export const EXPENSE_CATEGORY_OPTIONS: {
  value: ExpenseCategory;
  label: string;
}[] = [
  { value: "utilities", label: "Utilities (Water / Electric)" },
  { value: "supplies", label: "Supplies (Seals / Caps / Soap)" },
  { value: "maintenance", label: "Machine Maintenance / Filters" },
  { value: "salary", label: "Staff Wages / Allowance" },
  { value: "delivery_fuel", label: "Fuel & Transport" },
  { value: "rent", label: "Station Rent" },
  { value: "other", label: "Other Expense" },
];

export function formatPHP(value: number): string {
  return `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatCategoryLabel(category: ExpenseCategory): string {
  return (
    EXPENSE_CATEGORY_OPTIONS.find((opt) => opt.value === category)?.label ??
    category
  );
}
