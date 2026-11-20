export type SessionUser = {
  id: string;
  storeId: string;
  name: string;
  username: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
  permissions: string[];
};

export type CartItemInput = {
  productId: string;
  unitId: string;
  qty: number;
  discountPercent?: number;
  note?: string;
};

export type QuotedLine = {
  productId: string;
  name: string;
  sku: string | null;
  unitId: string;
  unitCode: string;
  qty: number;
  factor: number;
  qtyBase: number;
  unitPrice: number;
  priceSource: "unit" | "product" | "manual";
  gross: number;
  discountPercent: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  costBase: number;
  costTotal: number;
  stockAvailable: number;
  trackStock: boolean;
  note?: string;
};

export type QuoteTotals = {
  subtotal: number;
  itemDiscountTotal: number;
  taxTotal: number;
  roundingTotal: number;
  grandTotal: number;
  costTotal: number;
};

export type PaymentInput = {
  method: "cash" | "bank_transfer" | "ewallet" | "qris" | "other";
  amount: number;
  tendered?: number;
  referenceNo?: string;
  provider?: string;
};

export type CompleteSaleInput = {
  storeId: string;
  userId: string;
  shiftId: string;
  businessDate: string;
  items: CartItemInput[];
  payments: PaymentInput[];
  customerId?: string | null;
  note?: string;
  roundingIncrement?: number;
  occurredAt?: string;
  silent?: boolean;
};

export type CompletedSale = {
  id: string;
  receiptNo: string;
  grandTotal: number;
  paidTotal: number;
  changeTotal: number;
  dueTotal: number;
  lines: QuotedLine[];
  completedAt: string;
};
