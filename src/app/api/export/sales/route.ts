import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  if (!user.permissions.includes("reports.sales")) {
    return NextResponse.json({ error: "PERMISSION_DENIED" }, { status: 403 });
  }

  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from") ?? today;
  const to = url.searchParams.get("to") ?? today;

  const rows = getDb()
    .prepare(
      `SELECT s.receipt_no, s.business_date, s.status, s.payment_status, s.grand_total, s.paid_total,
              s.due_total, s.cost_total, s.completed_at, u.name AS cashier, c.name AS customer
       FROM sales s JOIN users u ON u.id = s.cashier_id
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.store_id = ? AND s.business_date BETWEEN ? AND ?
       ORDER BY s.completed_at`,
    )
    .all(user.storeId, from, to) as Record<string, unknown>[];

  const headers = [
    "receipt_no",
    "business_date",
    "status",
    "payment_status",
    "grand_total",
    "paid_total",
    "due_total",
    "cost_total",
    "completed_at",
    "cashier",
    "customer",
  ];
  const escape = (value: unknown) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => escape(row[key])).join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="openpos-penjualan-${from}-${to}.csv"`,
    },
  });
}
