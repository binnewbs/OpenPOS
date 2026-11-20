"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, Printer, ReceiptText, Search } from "lucide-react";
import { Badge, Button, EmptyState, Field, PageHeader, Panel, SectionHeader, cn } from "@/components/ui";
import { Modal } from "@/components/modal";
import { getSaleDetailAction, voidSaleAction } from "@/server/actions/pos";
import { formatDate, formatDateTime, formatTime, rupiah } from "@/server/format";

type Sale = {
  id: string;
  receipt_no: string | null;
  business_date: string;
  completed_at: string | null;
  status: string;
  payment_status: string;
  grand_total: number;
  paid_total: number;
  due_total: number;
  change_total: number;
  cost_total: number;
  cashier: string;
  customer: string | null;
  item_count: number;
};

type Detail = {
  sale: Record<string, unknown>;
  items: Record<string, unknown>[];
  payments: Record<string, unknown>[];
};

const statusTone: Record<string, "olive" | "danger" | "gold" | "neutral"> = {
  completed: "olive",
  voided: "danger",
  held: "gold",
};

export function SalesHistory({ sales, canVoid }: { sales: Sale[]; canVoid: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("semua");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sales.filter((sale) => {
      if (status !== "semua" && sale.status !== status) return false;
      if (!needle) return true;
      return (
        (sale.receipt_no ?? "").toLowerCase().includes(needle) ||
        (sale.customer ?? "").toLowerCase().includes(needle) ||
        sale.cashier.toLowerCase().includes(needle)
      );
    });
  }, [sales, query, status]);

  async function openDetail(sale: Sale) {
    setDetailLoading(true);
    setError("");
    const result = await getSaleDetailAction(sale.id);
    setDetail(result as Detail | null);
    setDetailLoading(false);
  }

  async function submitVoid() {
    if (!detail) return;
    setBusy(true);
    setError("");
    const result = await voidSaleAction({ saleId: String(detail.sale.id), reason });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setVoidOpen(false);
    setDetail(null);
    setReason("");
    router.refresh();
  }

  return (
    <div>
      <PageHeader title="Riwayat transaksi" subtitle="Cari nota, periksa rincian, atau batalkan transaksi dengan alasan yang tercatat." />

      <Panel padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <SectionHeader title="Nota" description={`${filtered.length} transaksi`} />
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nota, pelanggan, kasir..."
                className="field h-9 w-[230px] pl-8 text-[12.5px]"
              />
            </div>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="field h-9 w-[130px] text-[12.5px]">
              <option value="semua">Semua status</option>
              <option value="completed">Selesai</option>
              <option value="voided">Dibatalkan</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={<ReceiptText size={26} />} title="Tidak ada transaksi" description="Coba ubah filter atau mulai transaksi baru di kasir." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-line bg-paper-soft/50 text-[11px] text-muted">
                  <th className="px-5 py-2.5 font-medium">Nota</th>
                  <th className="px-3 py-2.5 font-medium">Waktu</th>
                  <th className="px-3 py-2.5 font-medium">Pelanggan</th>
                  <th className="px-3 py-2.5 font-medium">Kasir</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((sale) => (
                  <tr key={sale.id} className="transition-colors hover:bg-paper-soft/50">
                    <td className="px-5 py-3">
                      <button onClick={() => openDetail(sale)} className="text-left">
                        <p className="num whitespace-nowrap text-[12px] font-medium text-ink hover:text-accent-deep">{sale.receipt_no ?? "—"}</p>
                        <p className="text-[10.5px] text-muted">{sale.item_count} item</p>
                      </button>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-muted">
                      {formatDate(sale.business_date)}
                      <p className="text-[10.5px] text-faint">{sale.completed_at ? formatTime(sale.completed_at) : ""}</p>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-ink-soft">{sale.customer ?? "Pelanggan umum"}</td>
                    <td className="px-3 py-3 text-[12px] text-ink-soft">{sale.cashier.split(" ")[0]}</td>
                    <td className="num px-3 py-3 text-right text-[12.5px] font-medium text-ink">{rupiah(sale.grand_total)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={statusTone[sale.status] ?? "neutral"}>
                          {sale.status === "completed" ? "Selesai" : sale.status === "voided" ? "Dibatalkan" : "Ditahan"}
                        </Badge>
                        {sale.due_total > 0 ? <span className="text-[10px] text-danger">kasbon {rupiah(sale.due_total)}</span> : null}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => openDetail(sale)}>
                        Detail
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={Boolean(detail) || detailLoading}
        onClose={() => {
          setDetail(null);
          setDetailLoading(false);
        }}
        title="Rincian transaksi"
        description={detail ? String(detail.sale.receipt_no ?? "") : "Memuat..."}
        width="md"
        footer={
          detail ? (
            <div className="flex items-center justify-between gap-3">
              <Button variant="secondary" size="sm" onClick={() => window.print()}>
                <Printer size={14} /> Cetak
              </Button>
              {canVoid && detail.sale.status === "completed" ? (
                <Button variant="danger" size="sm" onClick={() => { setVoidOpen(true); setReason(""); setError(""); }}>
                  <Ban size={14} /> Batalkan transaksi
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-10 text-muted">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : detail ? (
          <div className="print-area">
            <div className="grid grid-cols-2 gap-3 rounded-[12px] bg-paper-soft px-4 py-3 text-[11.5px]">
              <div>
                <p className="text-muted">Waktu</p>
                <p className="text-ink">{detail.sale.completed_at ? formatDateTime(String(detail.sale.completed_at)) : "—"}</p>
              </div>
              <div>
                <p className="text-muted">Kasir</p>
                <p className="text-ink">{String(detail.sale.cashier ?? "—")}</p>
              </div>
              <div>
                <p className="text-muted">Pelanggan</p>
                <p className="text-ink">{String(detail.sale.customer ?? "Pelanggan umum")}</p>
              </div>
              <div>
                <p className="text-muted">Status</p>
                <p className="text-ink">{detail.sale.status === "voided" ? "Dibatalkan" : "Selesai"}</p>
              </div>
            </div>

            <div className="mt-4 divide-y divide-dashed divide-line">
              {detail.items.map((item) => (
                <div key={String(item.id)} className="flex items-baseline justify-between gap-3 py-2">
                  <div>
                    <p className="text-[12.5px] text-ink">{String(item.product_name)}</p>
                    <p className="num text-[10.5px] text-muted">
                      {Number(item.qty)} {String(item.unit_code)} × {rupiah(Number(item.unit_price))}
                    </p>
                  </div>
                  <p className="num text-[12px] font-medium text-ink">{rupiah(Number(item.line_total))}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 border-t border-line pt-3 text-[12px]">
              <div className="flex justify-between py-0.5 text-muted">
                <span>Subtotal</span>
                <span className="num text-ink-soft">{rupiah(Number(detail.sale.subtotal))}</span>
              </div>
              {Number(detail.sale.item_discount_total) > 0 ? (
                <div className="flex justify-between py-0.5 text-muted">
                  <span>Diskon</span>
                  <span className="num text-danger">-{rupiah(Number(detail.sale.item_discount_total))}</span>
                </div>
              ) : null}
              {Number(detail.sale.rounding_total) > 0 ? (
                <div className="flex justify-between py-0.5 text-muted">
                  <span>Pembulatan</span>
                  <span className="num text-ink-soft">{rupiah(Number(detail.sale.rounding_total))}</span>
                </div>
              ) : null}
              <div className="mt-1.5 flex items-center justify-between border-t border-line pt-2">
                <span className="font-medium text-ink">Total</span>
                <span className="num font-display text-[19px] text-ink">{rupiah(Number(detail.sale.grand_total))}</span>
              </div>
              <div className="mt-1 flex justify-between text-muted">
                <span>Dibayar</span>
                <span className="num text-ink-soft">{rupiah(Number(detail.sale.paid_total))}</span>
              </div>
              {Number(detail.sale.due_total) > 0 ? (
                <div className="flex justify-between text-danger">
                  <span>Kasbon</span>
                  <span className="num">{rupiah(Number(detail.sale.due_total))}</span>
                </div>
              ) : null}
              {Number(detail.sale.change_total) > 0 ? (
                <div className="flex justify-between text-muted">
                  <span>Kembalian</span>
                  <span className="num">{rupiah(Number(detail.sale.change_total))}</span>
                </div>
              ) : null}
            </div>

            {detail.sale.status === "voided" ? (
              <p className={cn("mt-3 rounded-[10px] bg-danger-soft px-3 py-2 text-[11.5px] text-danger")}>
                Dibatalkan: {String(detail.sale.void_reason ?? "tanpa alasan")}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        title="Batalkan transaksi?"
        description="Stok dan kas akan dikembalikan. Tindakan ini tercatat di log aktivitas."
        width="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setVoidOpen(false)}>Batal</Button>
            <Button variant="danger" onClick={submitVoid} disabled={busy || !reason.trim()}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : null} Batalkan
            </Button>
          </div>
        }
      >
        <Field label="Alasan pembatalan">
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="field min-h-[90px] resize-none"
            placeholder="Contoh: salah input barang"
            autoFocus
          />
        </Field>
        {error ? <p className="mt-3 rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p> : null}
      </Modal>
    </div>
  );
}
