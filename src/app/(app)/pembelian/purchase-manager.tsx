"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Truck } from "lucide-react";
import { Badge, Button, EmptyState, Field, PageHeader, Panel, SectionHeader, cn } from "@/components/ui";
import { Modal } from "@/components/modal";
import { receivePurchaseAction } from "@/server/actions/pos";
import { formatDate, rupiah } from "@/server/format";

type Purchase = {
  id: string;
  purchase_no: string;
  supplier_invoice_no: string | null;
  status: string;
  invoice_date: string;
  due_date: string | null;
  grand_total: number;
  paid_total: number;
  due_total: number;
  supplier_name: string;
  item_count: number;
  created_by_name: string | null;
};

type Supplier = {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  payment_term_days: number;
  total_due: number;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  base_unit_id: string;
  base_unit: string;
  cost_price: number;
  retail_price: number;
  units: { unitId: string; code: string; factor: number; isBase: boolean }[];
};

type Line = { productId: string; unitId: string; qty: number; unitCost: number };

export function PurchaseManager({
  purchases,
  suppliers,
  products,
  canReceive,
}: {
  purchases: Purchase[];
  suppliers: Supplier[];
  products: Product[];
  canReceive: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const summary = useMemo(
    () => ({
      due: suppliers.reduce((sum, supplier) => sum + Number(supplier.total_due), 0),
      month: purchases
        .filter((purchase) => purchase.invoice_date.slice(0, 7) === new Date().toISOString().slice(0, 7))
        .reduce((sum, purchase) => sum + Number(purchase.grand_total), 0),
      count: purchases.length,
    }),
    [purchases, suppliers],
  );

  const lineTotal = lines.reduce((sum, line) => sum + Math.round(line.qty * line.unitCost), 0);

  function addLine() {
    const product = products[0];
    if (!product) return;
    const base = product.units.find((unit) => unit.isBase) ?? product.units[0];
    setLines((current) => [
      ...current,
      { productId: product.id, unitId: base.unitId, qty: 1, unitCost: Math.round(Number(product.cost_price) * base.factor) },
    ]);
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        if (patch.unitId) {
          const product = products.find((item) => item.id === next.productId);
          const unit = product?.units.find((item) => item.unitId === patch.unitId);
          if (product && unit) next.unitCost = Math.round(Number(product.cost_price) * unit.factor);
        }
        if (patch.productId) {
          const product = products.find((item) => item.id === patch.productId);
          const base = product?.units.find((item) => item.isBase) ?? product?.units[0];
          if (product && base) {
            next.unitId = base.unitId;
            next.unitCost = Math.round(Number(product.cost_price) * base.factor);
          }
        }
        return next;
      }),
    );
  }

  async function submit() {
    if (!supplierId) {
      setError("Pilih supplier.");
      return;
    }
    if (!lines.length) {
      setError("Tambahkan minimal satu barang.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await receivePurchaseAction({
      supplierId,
      invoiceDate,
      dueDate: dueDate || null,
      supplierInvoiceNo: invoiceNo || undefined,
      items: lines,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setLines([]);
    setInvoiceNo("");
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Pembelian"
        subtitle="Terima barang dari supplier, catat utang, dan simpan riwayat harga beli."
        action={
          canReceive ? (
            <Button onClick={() => setOpen(true)}>
              <Plus size={15} /> Terima barang
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Panel>
          <p className="text-[11.5px] text-muted">Utang supplier</p>
          <p className={cn("num mt-1 font-display text-[25px]", summary.due > 0 ? "text-ink" : "text-ink")}>{rupiah(summary.due)}</p>
          <p className="mt-1 text-[11px] text-muted">belum dibayar</p>
        </Panel>
        <Panel>
          <p className="text-[11.5px] text-muted">Pembelian bulan ini</p>
          <p className="num mt-1 font-display text-[25px] text-ink">{rupiah(summary.month)}</p>
          <p className="mt-1 text-[11px] text-muted">nilai nota masuk</p>
        </Panel>
        <Panel>
          <p className="text-[11.5px] text-muted">Total nota</p>
          <p className="num mt-1 font-display text-[25px] text-ink">{summary.count}</p>
          <p className="mt-1 text-[11px] text-muted">pembelian tercatat</p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel padded={false}>
          <div className="border-b border-line px-5 py-4">
            <SectionHeader title="Nota pembelian" description="Barang masuk terbaru" />
          </div>
          {purchases.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Truck size={26} />}
                title="Belum ada pembelian"
                description="Catat barang masuk pertama dari supplier."
                action={canReceive ? <Button onClick={() => setOpen(true)}>Terima barang</Button> : null}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-line bg-paper-soft/50 text-[11px] text-muted">
                    <th className="px-5 py-2.5 font-medium">Nota</th>
                    <th className="px-3 py-2.5 font-medium">Supplier</th>
                    <th className="px-3 py-2.5 font-medium">Tanggal</th>
                    <th className="px-3 py-2.5 text-right font-medium">Total</th>
                    <th className="px-3 py-2.5 text-right font-medium">Sisa</th>
                    <th className="px-5 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {purchases.map((purchase) => (
                    <tr key={purchase.id} className="transition-colors hover:bg-paper-soft/50">
                      <td className="px-5 py-3">
                        <p className="num text-[12px] font-medium text-ink">{purchase.purchase_no}</p>
                        <p className="text-[10.5px] text-muted">
                          {purchase.item_count} barang{purchase.supplier_invoice_no ? ` · ${purchase.supplier_invoice_no}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-[12.5px] text-ink-soft">{purchase.supplier_name}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-[12px] text-muted">
                        {formatDate(purchase.invoice_date)}
                        {purchase.due_date ? <p className="text-[10.5px] text-faint">tempo {formatDate(purchase.due_date)}</p> : null}
                      </td>
                      <td className="num px-3 py-3 text-right text-[12.5px] font-medium text-ink">{rupiah(purchase.grand_total)}</td>
                      <td className="num px-3 py-3 text-right text-[12px] text-ink-soft">{rupiah(purchase.due_total)}</td>
                      <td className="px-5 py-3">
                        <Badge tone={Number(purchase.due_total) > 0 ? "gold" : "olive"}>
                          {Number(purchase.due_total) > 0 ? "Belum lunas" : "Lunas"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel padded={false}>
          <div className="border-b border-line px-5 py-4">
            <SectionHeader title="Supplier" description={`${suppliers.length} supplier aktif`} />
          </div>
          <div className="divide-y divide-line">
            {suppliers.map((supplier) => (
              <div key={supplier.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="text-[13px] font-medium text-ink">{supplier.name}</p>
                  <p className="text-[11px] text-muted">
                    {supplier.code ?? "—"} · tempo {supplier.payment_term_days} hari
                  </p>
                </div>
                <div className="text-right">
                  <p className="num text-[12.5px] font-medium text-ink">{rupiah(supplier.total_due)}</p>
                  <p className="text-[10px] text-faint">sisa utang</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Terima barang"
        description="Menyimpan nota akan menambah stok dan mencatat utang supplier."
        width="lg"
        footer={
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-muted">Total nota</p>
              <p className="num font-display text-[19px] text-ink">{rupiah(lineTotal)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Batal</Button>
              <Button onClick={submit} disabled={busy}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : null} Simpan pembelian
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier">
            <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="field">
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nomor invoice supplier">
            <input value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} className="field" placeholder="Opsional" />
          </Field>
          <Field label="Tanggal invoice">
            <input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} className="field" />
          </Field>
          <Field label="Tanggal jatuh tempo">
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="field" />
          </Field>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12.5px] font-medium text-ink-soft">Barang diterima</p>
              <p className="text-[11px] text-muted">Harga beli per satuan yang dipilih.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={addLine}>
              <Plus size={13} /> Baris
            </Button>
          </div>

          <div className="mt-3 space-y-2">
            {lines.length === 0 ? (
              <p className="rounded-[10px] border border-dashed border-line px-4 py-6 text-center text-[12px] text-muted">
                Belum ada barang. Klik “Baris” untuk menambahkan.
              </p>
            ) : (
              lines.map((line, index) => {
                const product = products.find((item) => item.id === line.productId);
                return (
                  <div key={index} className="grid grid-cols-[1.5fr_80px_80px_110px_32px] items-center gap-2">
                    <select
                      value={line.productId}
                      onChange={(event) => updateLine(index, { productId: event.target.value })}
                      className="field h-9 text-[12px]"
                    >
                      {products.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={line.unitId}
                      onChange={(event) => updateLine(index, { unitId: event.target.value })}
                      className="field h-9 text-[12px]"
                    >
                      {product?.units.map((unit) => (
                        <option key={unit.unitId} value={unit.unitId}>
                          {unit.code}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={line.qty}
                      onChange={(event) => updateLine(index, { qty: Number(event.target.value) })}
                      className="field num h-9 text-[12px]"
                      placeholder="Qty"
                    />
                    <input
                      type="number"
                      min={0}
                      value={line.unitCost}
                      onChange={(event) => updateLine(index, { unitCost: Number(event.target.value) })}
                      className="field num h-9 text-[12px]"
                      placeholder="Harga"
                    />
                    <button
                      onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                      className="flex h-9 w-8 items-center justify-center rounded-[8px] text-faint hover:bg-danger-soft hover:text-danger"
                      aria-label="Hapus baris"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {error ? <p className="mt-3 rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p> : null}
      </Modal>
    </div>
  );
}
