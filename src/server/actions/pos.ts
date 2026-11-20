"use server";

import { revalidatePath } from "next/cache";
import { assertPermission, requireUser } from "../auth";
import { getDb } from "../db";
import { businessDate } from "../format";
import { getOpenShift, getSaleDetail } from "../queries";
import { plain } from "@/lib/plain";
import { completeSale, voidSale } from "../services/sales";
import { closeShift, openShift } from "../services/shifts";
import { recordCreditPayment } from "../services/credit";
import { postPurchase } from "../services/inventory";
import type { ActionResult } from "./auth";
import type { CartItemInput, PaymentInput } from "@/lib/types";

function fail(error: unknown): ActionResult<never> {
  const e = error as Error & { code?: string };
  return { ok: false, error: e.message || "Terjadi kesalahan.", code: e.code };
}

export async function completeSaleAction(input: {
  items: CartItemInput[];
  payments: PaymentInput[];
  customerId?: string | null;
  note?: string;
  discountPercent?: number;
}): Promise<ActionResult<{ id: string; receiptNo: string; grandTotal: number; changeTotal: number; dueTotal: number }>> {
  try {
    const user = await requireUser();
    assertPermission(user, "sales.create");
    const shift = getOpenShift(user.storeId);
    if (!shift) return { ok: false, error: "Buka shift terlebih dahulu.", code: "SHIFT_REQUIRED" };

    const sale = completeSale(getDb(), {
      storeId: user.storeId,
      userId: user.id,
      shiftId: shift.id,
      businessDate: businessDate(),
      items: input.items,
      payments: input.payments,
      customerId: input.customerId ?? null,
      note: input.note,
    });
    revalidatePath("/");
    revalidatePath("/kasir");
    revalidatePath("/laporan");
    revalidatePath("/stok");
    return {
      ok: true,
      data: {
        id: sale.id,
        receiptNo: sale.receiptNo,
        grandTotal: sale.grandTotal,
        changeTotal: sale.changeTotal,
        dueTotal: sale.dueTotal,
      },
    };
  } catch (error) {
    return fail(error);
  }
}

export async function getSaleDetailAction(saleId: string) {
  const user = await requireUser();
  return plain(getSaleDetail(user.storeId, saleId));
}

export async function voidSaleAction(input: { saleId: string; reason: string }): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertPermission(user, "sales.void");
    voidSale(getDb(), { storeId: user.storeId, userId: user.id, saleId: input.saleId, reason: input.reason });
    revalidatePath("/");
    revalidatePath("/laporan");
    revalidatePath("/riwayat");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function openShiftAction(input: { openingCash: number }): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertPermission(user, "shifts.open");
    openShift(getDb(), {
      storeId: user.storeId,
      userId: user.id,
      openingCash: input.openingCash,
      businessDate: businessDate(),
    });
    revalidatePath("/");
    revalidatePath("/shift");
    revalidatePath("/kasir");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function closeShiftAction(input: { countedCash: number; note?: string }): Promise<ActionResult<{ expected: number; difference: number }>> {
  try {
    const user = await requireUser();
    assertPermission(user, "shifts.close");
    const shift = getOpenShift(user.storeId);
    if (!shift) return { ok: false, error: "Tidak ada shift yang sedang buka.", code: "SHIFT_NOT_FOUND" };
    const result = closeShift(getDb(), {
      storeId: user.storeId,
      userId: user.id,
      shiftId: shift.id,
      countedCash: input.countedCash,
      note: input.note,
    });
    revalidatePath("/");
    revalidatePath("/shift");
    revalidatePath("/kasir");
    return { ok: true, data: result };
  } catch (error) {
    return fail(error);
  }
}

export async function creditPaymentAction(input: {
  customerId: string;
  amount: number;
  method: "cash" | "bank_transfer" | "ewallet" | "qris" | "other";
  referenceNo?: string;
  note?: string;
}): Promise<ActionResult> {
  try {
    const user = await requireUser();
    assertPermission(user, "credit.payment");
    const shift = getOpenShift(user.storeId);
    recordCreditPayment(getDb(), {
      storeId: user.storeId,
      userId: user.id,
      shiftId: shift?.id ?? null,
      customerId: input.customerId,
      amount: input.amount,
      method: input.method,
      referenceNo: input.referenceNo,
      note: input.note,
      businessDate: businessDate(),
    });
    revalidatePath("/pelanggan");
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function receivePurchaseAction(input: {
  supplierId: string;
  invoiceDate: string;
  dueDate: string | null;
  supplierInvoiceNo?: string;
  notes?: string;
  items: { productId: string; unitId: string; qty: number; unitCost: number }[];
}): Promise<ActionResult<{ purchaseNo: string; grandTotal: number }>> {
  try {
    const user = await requireUser();
    assertPermission(user, "inventory.receive");
    const result = postPurchase(getDb(), {
      storeId: user.storeId,
      userId: user.id,
      supplierId: input.supplierId,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      supplierInvoiceNo: input.supplierInvoiceNo,
      notes: input.notes,
      items: input.items,
    });
    revalidatePath("/pembelian");
    revalidatePath("/stok");
    return { ok: true, data: { purchaseNo: result.purchaseNo, grandTotal: result.grandTotal } };
  } catch (error) {
    return fail(error);
  }
}
