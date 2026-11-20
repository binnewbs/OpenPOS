import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  ChevronRight,
  ReceiptText,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import { requireUser } from "@/server/auth";
import { getDashboard } from "@/server/queries";
import { formatLongDate, formatTime, rupiah, shortRupiah } from "@/server/format";
import { Badge, Button, Panel, PageHeader, SectionHeader, buttonClass, cn } from "@/components/ui";
import { SalesTrend } from "@/components/charts";

export const dynamic = "force-dynamic";

type RecentSale = {
  id: string;
  receipt_no: string;
  grand_total: number;
  payment_status: string;
  completed_at: string;
  cashier: string;
  customer: string | null;
  item_count: number;
};

const methodLabel: Record<string, string> = {
  cash: "Tunai",
  bank_transfer: "Transfer bank",
  ewallet: "E-wallet",
  qris: "QRIS",
  other: "Lainnya",
};

export default async function DashboardPage() {
  const user = await requireUser();
  const data = getDashboard(user.storeId);
  const today = Number(data.todayTotals.gross);
  const yesterday = Number(data.yesterdayTotals.gross);
  const delta = yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : null;
  const average = data.todayTotals.transactions > 0 ? today / Number(data.todayTotals.transactions) : 0;
  const cashToday = data.payments.find((p) => p.method === "cash")?.amount ?? 0;
  const paymentTotal = data.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const recentSales = data.recentSales as RecentSale[];
  const profitMargin = today > 0 ? Math.round(((today - Number(data.todayTotals.cogs)) / today) * 100) : 0;

  return (
    <div>
      <PageHeader
        meta={formatLongDate(data.today)}
        title="Ringkasan hari ini"
        subtitle="Angka yang penting saja, supaya kamu bisa fokus melayani pembeli."
        action={
          <Link href="/kasir" className={buttonClass("primary", "md")}>
            Buka kasir <ArrowRight size={15} />
          </Link>
        }
      />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Panel className="overflow-hidden p-0">
          <div className="p-6 sm:p-7">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-muted">Penjualan hari ini</p>
              <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
                <span className={cn("h-1.5 w-1.5 rounded-full", data.openShift ? "bg-olive" : "bg-danger")} />
                {data.openShift ? "Shift terbuka" : "Shift tertutup"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <p className="num font-display text-[46px] leading-none tracking-[-0.02em] text-ink sm:text-[54px]">
                {rupiah(today)}
              </p>
              {delta !== null ? (
                <span
                  className={cn(
                    "mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium",
                    delta >= 0 ? "bg-olive-soft text-olive" : "bg-danger-soft text-danger",
                  )}
                >
                  {delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {Math.abs(delta)}%
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-[12.5px] text-muted">
              Kemarin {rupiah(yesterday)} · margin kotor hari ini {profitMargin}%
            </p>
          </div>

          <div className="grid grid-cols-3 border-t border-line bg-paper-soft/60">
            {[
              { label: "Transaksi", value: String(data.todayTotals.transactions ?? 0) },
              { label: "Laba kotor", value: rupiah(today - Number(data.todayTotals.cogs)) },
              { label: "Rata-rata nota", value: rupiah(average) },
            ].map((item, index) => (
              <div key={item.label} className={cn("px-5 py-4", index > 0 && "border-l border-line")}>
                <p className="text-[11.5px] text-muted">{item.label}</p>
                <p className="num mt-1 font-display text-[19px] leading-tight text-ink">{item.value}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="flex flex-col p-0">
          <div className="px-6 pt-5">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-muted">Laci kas</p>
              <Banknote size={16} className="text-faint" />
            </div>
            <p className="num mt-1.5 font-display text-[28px] leading-none text-ink">
              {rupiah(data.openShift?.expected_cash_live ?? 0)}
            </p>
            <p className="mt-1 text-[11.5px] text-muted">
              Modal awal {rupiah(data.openShift?.opening_cash ?? 0)} · tunai masuk {rupiah(Number(cashToday))}
            </p>
            <div className="mt-4 flex items-center gap-2">
              <Link href="/shift" className={buttonClass("secondary", "sm", "flex-1")}>
                {data.openShift ? "Tutup shift" : "Buka shift"}
              </Link>
              <Link href="/riwayat" className={buttonClass("ghost", "sm")}>
                Riwayat
              </Link>
            </div>
          </div>

          <div className="mt-auto border-t border-line px-6 py-4">
            <div className="flex items-center justify-between">
              <p className="text-[12.5px] font-medium text-ink-soft">Perlu perhatian</p>
              <span className="text-[11px] text-muted">Hari ini</span>
            </div>
            <div className="mt-3 space-y-2.5">
              <Link href="/pelanggan" className="group flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5 text-[12.5px] text-ink-soft">
                  <Users size={14} className="text-faint" /> Piutang pelanggan
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="num text-[12.5px] font-medium text-ink">{shortRupiah(data.receivables)}</span>
                  <ChevronRight size={13} className="text-faint transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
              <Link href="/pembelian" className="group flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5 text-[12.5px] text-ink-soft">
                  <Truck size={14} className="text-faint" /> Utang supplier
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="num text-[12.5px] font-medium text-ink">{shortRupiah(data.payables)}</span>
                  <ChevronRight size={13} className="text-faint transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
              <Link href="/stok" className="group flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5 text-[12.5px] text-ink-soft">
                  <AlertTriangle size={14} className="text-faint" /> Stok menipis
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={cn("num text-[12.5px] font-medium", data.lowStockCount > 0 ? "text-danger" : "text-ink")}>
                    {data.lowStockCount} produk
                  </span>
                  <ChevronRight size={13} className="text-faint transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </div>
          </div>
        </Panel>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Panel>
          <SectionHeader
            title="Tren penjualan"
            description="14 hari terakhir"
            action={
              <Link href="/laporan" className="flex items-center gap-1 text-[12.5px] text-accent-deep hover:underline">
                Lihat laporan <ArrowUpRight size={13} />
              </Link>
            }
          />
          <div className="-mx-2 mt-4">
            <SalesTrend data={data.series} />
          </div>
        </Panel>

        <Panel>
          <SectionHeader
            title="Stok menipis"
            description={`${data.lowStockCount} produk perlu restock`}
            action={
              <Link href="/stok" className="text-[12.5px] text-accent-deep hover:underline">
                Semua
              </Link>
            }
          />
          <div className="mt-4 space-y-1">
            {data.lowStock.length === 0 ? (
              <p className="rounded-[12px] bg-olive-soft/60 px-4 py-6 text-center text-[12.5px] text-olive">
                Semua stok aman.
              </p>
            ) : (
              data.lowStock.map((item) => (
                <Link
                  key={item.product_id}
                  href="/stok"
                  className="flex items-center justify-between gap-3 rounded-[10px] px-2.5 py-2.5 transition-colors hover:bg-canvas-deep/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink">{item.name}</p>
                    <p className="text-[11px] text-muted">Min. {item.min_stock_qty} {item.base_unit}</p>
                  </div>
                  <div className="text-right">
                    <p className="num text-[13px] font-medium text-danger">
                      {item.qty_on_hand} <span className="text-[10.5px] font-normal text-muted">{item.base_unit}</span>
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Panel>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.45fr]">
        <Panel>
          <SectionHeader title="Produk terlaris" description="7 hari terakhir" />
          <div className="mt-4 space-y-3">
            {data.topProducts.length === 0 ? (
              <p className="text-[12.5px] text-muted">Belum ada penjualan.</p>
            ) : (
              data.topProducts.map((product, index) => (
                <div key={product.id} className="flex items-center gap-3">
                  <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-canvas-deep text-[11px] font-medium text-ink-soft">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">{product.name}</p>
                    <p className="text-[11px] text-muted">{Number(product.units)} unit terjual</p>
                  </div>
                  <p className="num text-[12.5px] font-medium text-ink">{shortRupiah(Number(product.revenue))}</p>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[12px] font-medium text-muted">Metode pembayaran hari ini</p>
            <div className="mt-3 space-y-2.5">
              {data.payments.length === 0 ? (
                <p className="text-[12px] text-muted">Belum ada pembayaran.</p>
              ) : (
                data.payments.map((payment) => {
                  const share = paymentTotal > 0 ? Math.round((Number(payment.amount) / paymentTotal) * 100) : 0;
                  return (
                    <div key={payment.method}>
                      <div className="mb-1 flex items-center justify-between text-[11.5px]">
                        <span className="text-ink-soft">{methodLabel[payment.method] ?? payment.method}</span>
                        <span className="num text-muted">{share}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-canvas-deep">
                        <div className="h-full rounded-full bg-accent/70" style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </Panel>

        <Panel className="p-0">
          <div className="px-5 pt-5">
            <SectionHeader
              title="Nota terakhir"
              description="Transaksi terbaru di kasir"
              action={
                <Link href="/riwayat" className="text-[12.5px] text-accent-deep hover:underline">
                  Semua
                </Link>
              }
            />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[440px] text-left">
              <thead>
                <tr className="border-y border-line bg-paper-soft/50 text-[11px] text-muted">
                  <th className="px-5 py-2 font-medium">Nota</th>
                  <th className="px-3 py-2 font-medium">Waktu</th>
                  <th className="px-3 py-2 font-medium">Kasir</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-5 py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recentSales.map((sale) => (
                  <tr key={sale.id} className="transition-colors hover:bg-paper-soft/60">
                    <td className="px-5 py-2.5">
                      <Link href={`/riwayat?nota=${sale.receipt_no}`} className="num whitespace-nowrap text-[12px] font-medium text-ink hover:text-accent-deep">
                        {sale.receipt_no}
                      </Link>
                      <p className="text-[10.5px] text-muted">
                        {sale.customer ?? "Pelanggan umum"} · {sale.item_count} item
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-ink-soft">{formatTime(sale.completed_at)}</td>
                    <td className="px-3 py-2.5 text-[12px] text-ink-soft">{sale.cashier.split(" ")[0]}</td>
                    <td className="num px-3 py-2.5 text-right text-[12.5px] font-medium text-ink">{rupiah(sale.grand_total)}</td>
                    <td className="px-5 py-2.5 text-right">
                      <Badge tone={sale.payment_status === "paid" ? "olive" : sale.payment_status === "unpaid" ? "danger" : "gold"}>
                        {sale.payment_status === "paid" ? "Lunas" : sale.payment_status === "unpaid" ? "Kasbon" : "Sebagian"}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {recentSales.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-[12.5px] text-muted">
                      Belum ada transaksi. Buka kasir untuk mulai berjualan.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-5 py-3">
            <Link href="/riwayat" className="flex items-center justify-center gap-1 text-[12px] text-muted hover:text-ink">
              Lihat semua transaksi <ArrowRight size={13} />
            </Link>
          </div>
        </Panel>
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-3">
        <Panel className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-accent-soft text-accent-deep">
            <TrendingUp size={18} />
          </div>
          <div>
            <p className="text-[11.5px] text-muted">Laba bulan ini</p>
            <p className="num font-display text-[20px] text-ink">{rupiah(data.grossProfit)}</p>
          </div>
        </Panel>
        <Panel className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-danger-soft text-danger">
            <ReceiptText size={18} />
          </div>
          <div>
            <p className="text-[11.5px] text-muted">Piutang lewat tempo</p>
            <p className="num font-display text-[20px] text-ink">{rupiah(data.overdue)}</p>
          </div>
        </Panel>
        <Panel className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-olive-soft text-olive">
            <Banknote size={18} />
          </div>
          <div>
            <p className="text-[11.5px] text-muted">Laba bersih bulan ini</p>
            <p className="num font-display text-[20px] text-ink">{rupiah(data.netProfit)}</p>
          </div>
        </Panel>
      </section>
    </div>
  );
}
