import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Download, ReceiptText, TrendingUp } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getReports } from "@/server/queries";
import { plain } from "@/lib/plain";
import { addDays, businessDate, formatDate, rupiah, shortRupiah } from "@/server/format";
import { Badge, Panel, PageHeader, SectionHeader, buttonClass, cn } from "@/components/ui";
import { ProfitBars } from "@/components/charts";

export const dynamic = "force-dynamic";

const methodLabel: Record<string, string> = {
  cash: "Tunai",
  bank_transfer: "Transfer bank",
  ewallet: "E-wallet",
  qris: "QRIS",
  other: "Lainnya",
};

function resolveRange(params: { from?: string; to?: string; preset?: string }) {
  const today = businessDate();
  const preset = params.preset ?? (params.from && params.to ? "custom" : "30d");
  let from = params.from ?? addDays(today, -29);
  let to = params.to ?? today;
  if (preset === "today") {
    from = today;
    to = today;
  } else if (preset === "7d") {
    from = addDays(today, -6);
    to = today;
  } else if (preset === "30d") {
    from = addDays(today, -29);
    to = today;
  } else if (preset === "month") {
    from = `${today.slice(0, 7)}-01`;
    to = today;
  }
  return { from, to, preset };
}

const presets = [
  { key: "today", label: "Hari ini" },
  { key: "7d", label: "7 hari" },
  { key: "30d", label: "30 hari" },
  { key: "month", label: "Bulan ini" },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; preset?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const { from, to, preset } = resolveRange(params);
  const report = getReports(user.storeId, from, to);
  const gross = Number(report.totals.gross);
  const cogs = Number(report.totals.cogs);
  const profit = gross - cogs;
  const margin = gross > 0 ? Math.round((profit / gross) * 100) : 0;
  const average = report.totals.transactions > 0 ? gross / Number(report.totals.transactions) : 0;
  const paymentTotal = report.paymentMix.reduce((sum, item) => sum + Number(item.amount), 0);
  const maxCategory = Math.max(...report.byCategory.map((item) => Number(item.revenue)), 1);

  return (
    <div>
      <PageHeader
        title="Laporan"
        meta={`${formatDate(from)} — ${formatDate(to)}`}
        subtitle="Angka penjualan, laba, dan metode pembayaran dalam satu pandangan."
        action={
          <Link href={`/api/export/sales?from=${from}&to=${to}`} className={buttonClass("secondary", "md")}>
            <Download size={15} /> Ekspor CSV
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((item) => (
            <Link
              key={item.key}
              href={`/laporan?preset=${item.key}`}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                preset === item.key
                  ? "border-ink/70 bg-ink text-rail-ink"
                  : "border-line bg-paper text-ink-soft hover:border-line-strong",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <form className="flex items-center gap-2" action="/laporan">
          <input type="hidden" name="preset" value="custom" />
          <input type="date" name="from" defaultValue={from} className="field h-9 w-[140px] text-[12px]" />
          <span className="text-[12px] text-muted">s/d</span>
          <input type="date" name="to" defaultValue={to} className="field h-9 w-[140px] text-[12px]" />
          <button type="submit" className={buttonClass("secondary", "sm")}>
            Terapkan
          </button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel>
          <div className="flex items-center justify-between">
            <p className="text-[11.5px] text-muted">Penjualan kotor</p>
            <ReceiptText size={15} className="text-faint" />
          </div>
          <p className="num mt-1.5 font-display text-[26px] text-ink">{rupiah(gross)}</p>
          <p className="mt-1 text-[11px] text-muted">{report.totals.transactions} transaksi</p>
        </Panel>
        <Panel>
          <div className="flex items-center justify-between">
            <p className="text-[11.5px] text-muted">Laba kotor</p>
            <TrendingUp size={15} className="text-faint" />
          </div>
          <p className="num mt-1.5 font-display text-[26px] text-olive">{rupiah(profit)}</p>
          <p className="mt-1 text-[11px] text-muted">margin {margin}%</p>
        </Panel>
        <Panel>
          <div className="flex items-center justify-between">
            <p className="text-[11.5px] text-muted">Rata-rata nota</p>
            <ArrowUpRight size={15} className="text-faint" />
          </div>
          <p className="num mt-1.5 font-display text-[26px] text-ink">{rupiah(average)}</p>
          <p className="mt-1 text-[11px] text-muted">per transaksi</p>
        </Panel>
        <Panel>
          <div className="flex items-center justify-between">
            <p className="text-[11.5px] text-muted">Penjualan kredit</p>
            <ArrowDownRight size={15} className="text-faint" />
          </div>
          <p className="num mt-1.5 font-display text-[26px] text-ink">{rupiah(report.totals.credit)}</p>
          <p className="mt-1 text-[11px] text-muted">{report.returns.count} retur · {rupiah(report.returns.amount)}</p>
        </Panel>
      </div>

      <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel>
          <SectionHeader title="Penjualan & laba harian" description="Bandingkan omzet dengan laba kotor." />
          <div className="mt-4">
            <ProfitBars data={plain(report.daily)} />
          </div>
        </Panel>

        <Panel>
          <SectionHeader title="Metode pembayaran" description="Komposisi nilai transaksi" />
          <div className="mt-4 space-y-3">
            {report.paymentMix.length === 0 ? (
              <p className="text-[12.5px] text-muted">Belum ada pembayaran pada periode ini.</p>
            ) : (
              report.paymentMix.map((item) => {
                const share = paymentTotal > 0 ? Math.round((Number(item.amount) / paymentTotal) * 100) : 0;
                return (
                  <div key={item.method}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="text-ink-soft">{methodLabel[item.method] ?? item.method}</span>
                      <span className="num text-muted">{rupiah(item.amount)} · {share}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-canvas-deep">
                      <div className="h-full rounded-full bg-accent/70" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <p className="mb-3 text-[12px] font-medium text-ink-soft">Per kasir</p>
            <div className="space-y-2.5">
              {report.byCashier.map((item) => (
                <div key={item.cashier} className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="text-ink-soft">{item.cashier}</span>
                  <span className="num text-ink">{rupiah(item.gross)}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </section>

      <section className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Panel padded={false}>
          <div className="border-b border-line px-5 py-4">
            <SectionHeader title="Penjualan per kategori" description="Kontribusi omzet" />
          </div>
          <div className="p-5">
            <div className="space-y-3.5">
              {report.byCategory.length === 0 ? (
                <p className="text-[12.5px] text-muted">Belum ada penjualan.</p>
              ) : (
                report.byCategory.map((item) => (
                  <div key={item.category}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="text-ink-soft">{item.category}</span>
                      <span className="num text-ink">{rupiah(item.revenue)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-canvas-deep">
                      <div className="h-full rounded-full bg-olive/60" style={{ width: `${Math.max(4, (Number(item.revenue) / maxCategory) * 100)}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Panel>

        <Panel padded={false}>
          <div className="border-b border-line px-5 py-4">
            <SectionHeader title="Produk teratas" description="Berdasarkan omzet" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left">
              <thead>
                <tr className="border-b border-line bg-paper-soft/50 text-[11px] text-muted">
                  <th className="px-5 py-2.5 font-medium">Produk</th>
                  <th className="px-3 py-2.5 text-right font-medium">Unit</th>
                  <th className="px-3 py-2.5 text-right font-medium">Omzet</th>
                  <th className="px-5 py-2.5 text-right font-medium">Laba</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.topProducts.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-2.5">
                      <p className="text-[12.5px] font-medium text-ink">{item.name}</p>
                      <p className="text-[10.5px] text-muted">{item.sku ?? "Tanpa SKU"}</p>
                    </td>
                    <td className="num px-3 py-2.5 text-right text-[12px] text-ink-soft">{Number(item.units)}</td>
                    <td className="num px-3 py-2.5 text-right text-[12px] text-ink">{shortRupiah(Number(item.revenue))}</td>
                    <td className="num px-5 py-2.5 text-right text-[12px] text-olive">{shortRupiah(Number(item.profit))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>
    </div>
  );
}
