"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Boxes, Loader2, Search, SlidersHorizontal } from "lucide-react";
import { Badge, Button, EmptyState, Field, PageHeader, Panel, SectionHeader, cn } from "@/components/ui";
import { Modal } from "@/components/modal";
import { adjustStockAction } from "@/server/actions/catalog";
import { formatDateTime, qty, rupiah } from "@/server/format";

type Item = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  base_unit: string;
  qty_on_hand: number;
  avg_cost: number;
  stock_value: number;
  min_stock_qty: number;
  is_low_stock: number;
  cost_price: number;
  retail_price: number;
};

type Movement = {
  id: string;
  movement_type: string;
  qty_delta: number;
  qty_input: number | null;
  unit_cost: number;
  total_cost: number;
  reference_type: string | null;
  reason: string | null;
  business_date: string;
  created_at: string;
  product_name: string;
  unit_code: string | null;
  user_name: string | null;
};

const movementLabel: Record<string, string> = {
  opening: "Saldo awal",
  purchase: "Pembelian",
  purchase_return: "Retur beli",
  sale: "Penjualan",
  sale_return: "Retur jual",
  adjustment: "Penyesuaian",
  opname: "Opname",
  waste: "Rusak",
  expiry: "Kedaluwarsa",
  transfer_in: "Masuk",
  transfer_out: "Keluar",
};

export function StockManager({
  items,
  totals,
  movements,
  canAdjust,
}: {
  items: Item[];
  totals: { value: number; units: number; low: number };
  movements: Movement[];
  canAdjust: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("Hasil hitung fisik (opname)");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (onlyLow && !item.is_low_stock) return false;
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle) || (item.sku ?? "").toLowerCase().includes(needle);
    });
  }, [items, query, onlyLow]);

  const resulting = selected ? Number(selected.qty_on_hand) + Number(delta || 0) : 0;

  async function submit() {
    if (!selected) return;
    const value = Number(delta);
    if (!value) {
      setError("Masukkan jumlah penyesuaian.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await adjustStockAction({ productId: selected.id, qtyDelta: value, reason });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSelected(null);
    setDelta("");
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Persediaan"
        subtitle="Stok dihitung dari buku besar mutasi. Setiap perubahan meninggalkan jejak."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Panel>
          <p className="text-[11.5px] text-muted">Nilai persediaan</p>
          <p className="num mt-1 font-display text-[25px] text-ink">{rupiah(totals.value)}</p>
          <p className="mt-1 text-[11px] text-muted">pada harga rata-rata</p>
        </Panel>
        <Panel>
          <p className="text-[11.5px] text-muted">Unit tercatat</p>
          <p className="num mt-1 font-display text-[25px] text-ink">{qty(totals.units)}</p>
          <p className="mt-1 text-[11px] text-muted">satuan dasar</p>
        </Panel>
        <Panel>
          <p className="text-[11.5px] text-muted">Produk menipis</p>
          <p className={cn("num mt-1 font-display text-[25px]", totals.low ? "text-danger" : "text-ink")}>{totals.low}</p>
          <p className="mt-1 text-[11px] text-muted">di bawah batas minimum</p>
        </Panel>
      </div>

      <Panel padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <SectionHeader title="Stok saat ini" description={`${filtered.length} produk`} />
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari produk..."
                className="field h-9 w-[200px] pl-8 text-[12.5px]"
              />
            </div>
            <button
              onClick={() => setOnlyLow((value) => !value)}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-[9px] border px-3 text-[12px] transition-colors",
                onlyLow ? "border-danger/40 bg-danger-soft text-danger" : "border-line bg-paper text-ink-soft hover:border-line-strong",
              )}
            >
              <SlidersHorizontal size={13} /> Menipis
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={<Boxes size={26} />} title="Tidak ada produk" description="Ubah filter atau tambah produk terlebih dahulu." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left">
              <thead>
                <tr className="border-b border-line bg-paper-soft/50 text-[11px] text-muted">
                  <th className="px-5 py-2.5 font-medium">Produk</th>
                  <th className="px-3 py-2.5 text-right font-medium">Stok</th>
                  <th className="px-3 py-2.5 text-right font-medium">Minimum</th>
                  <th className="px-3 py-2.5 text-right font-medium">HPP rata-rata</th>
                  <th className="px-3 py-2.5 text-right font-medium">Nilai</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-paper-soft/50">
                    <td className="px-5 py-3">
                      <p className="text-[13px] font-medium text-ink">{item.name}</p>
                      <p className="text-[11px] text-muted">
                        {item.category ?? "Tanpa kategori"}
                        {item.sku ? ` · ${item.sku}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <p className={cn("num text-[13px] font-medium", item.is_low_stock ? "text-danger" : "text-ink")}>
                        {qty(item.qty_on_hand)}
                      </p>
                      <p className="text-[10px] text-faint">{item.base_unit}</p>
                    </td>
                    <td className="num px-3 py-3 text-right text-[12px] text-muted">{qty(item.min_stock_qty)}</td>
                    <td className="num px-3 py-3 text-right text-[12px] text-ink-soft">{rupiah(item.avg_cost)}</td>
                    <td className="num px-3 py-3 text-right text-[12.5px] text-ink">{rupiah(item.stock_value)}</td>
                    <td className="px-3 py-3">
                      {item.is_low_stock ? (
                        <Badge tone="danger">Menipis</Badge>
                      ) : (
                        <span className="text-[11.5px] text-muted">Aman</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {canAdjust ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelected(item);
                            setDelta("");
                            setError("");
                          }}
                        >
                          Sesuaikan
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="mt-4" padded={false}>
        <div className="border-b border-line px-5 py-4">
          <SectionHeader title="Mutasi terakhir" description="Jejak keluar-masuk barang, terbaru di atas." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-line bg-paper-soft/50 text-[11px] text-muted">
                <th className="px-5 py-2.5 font-medium">Waktu</th>
                <th className="px-3 py-2.5 font-medium">Produk</th>
                <th className="px-3 py-2.5 font-medium">Jenis</th>
                <th className="px-3 py-2.5 text-right font-medium">Jumlah</th>
                <th className="px-3 py-2.5 text-right font-medium">Nilai</th>
                <th className="px-5 py-2.5 font-medium">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {movements.map((movement) => {
                const positive = Number(movement.qty_delta) > 0;
                return (
                  <tr key={movement.id} className="text-[12px]">
                    <td className="px-5 py-2.5 text-muted">{formatDateTime(movement.created_at)}</td>
                    <td className="px-3 py-2.5 font-medium text-ink">{movement.product_name}</td>
                    <td className="px-3 py-2.5 text-ink-soft">{movementLabel[movement.movement_type] ?? movement.movement_type}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={cn("num inline-flex items-center gap-1 font-medium", positive ? "text-olive" : "text-danger")}>
                        {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {qty(Math.abs(Number(movement.qty_delta)))}
                      </span>
                    </td>
                    <td className="num px-3 py-2.5 text-right text-ink-soft">{rupiah(movement.total_cost)}</td>
                    <td className="px-5 py-2.5 text-[11.5px] text-muted">
                      {movement.reason ?? movement.reference_type ?? "—"}
                      {movement.user_name ? ` · ${movement.user_name.split(" ")[0]}` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Sesuaikan stok"
        description={selected?.name}
        width="sm"
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11.5px] text-muted">Stok baru: <b className="text-ink">{qty(resulting)} {selected?.base_unit}</b></span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Batal
              </Button>
              <Button onClick={submit} disabled={busy || !delta}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : null} Simpan
              </Button>
            </div>
          </div>
        }
      >
        {selected ? (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[10px] bg-paper-soft px-3 py-2.5">
                <p className="text-[10.5px] text-muted">Stok tercatat</p>
                <p className="num text-[15px] font-medium text-ink">{qty(selected.qty_on_hand)} {selected.base_unit}</p>
              </div>
              <div className="rounded-[10px] bg-paper-soft px-3 py-2.5">
                <p className="text-[10.5px] text-muted">HPP rata-rata</p>
                <p className="num text-[15px] font-medium text-ink">{rupiah(selected.avg_cost)}</p>
              </div>
            </div>
            <Field label="Perubahan jumlah" hint="Gunakan angka negatif untuk mengurangi stok.">
              <input
                type="number"
                value={delta}
                onChange={(event) => setDelta(event.target.value)}
                className="field num"
                placeholder="Contoh: -2 atau 5"
                autoFocus
              />
            </Field>
            <Field label="Alasan">
              <select value={reason} onChange={(event) => setReason(event.target.value)} className="field">
                <option>Hasil hitung fisik (opname)</option>
                <option>Barang rusak</option>
                <option>Barang kedaluwarsa</option>
                <option>Koreksi salah input</option>
                <option>Pembelian belum tercatat</option>
              </select>
            </Field>
            {error ? <p className="rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
