"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, Field, PageHeader, Panel, SectionHeader, cn } from "@/components/ui";
import { Modal } from "@/components/modal";
import { saveProductAction } from "@/server/actions/catalog";
import { rupiah } from "@/server/format";

export type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  retail_price: number;
  cost_price: number;
  min_stock_qty: number;
  track_stock: number;
  is_active: number;
  category_id: string | null;
  category: string | null;
  base_unit: string;
  base_unit_id: string;
  qty_on_hand: number;
  is_low_stock: number;
  avg_cost: number;
  stock_value: number;
  units: { unitId: string; factor: number; price: number }[];
};

type UnitRow = { unitId: string; factor: number; price: number };

const emptyForm = {
  id: undefined as string | undefined,
  name: "",
  sku: "",
  brand: "",
  categoryId: "",
  baseUnitId: "",
  costPrice: 0,
  retailPrice: 0,
  minStock: 0,
  openingStock: 0,
  units: [] as UnitRow[],
};

export function ProductManager({
  products,
  units,
  categories,
  canEdit,
}: {
  products: ProductRow[];
  units: { id: string; code: string; name: string }[];
  categories: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Semua");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      if (category !== "Semua" && product.category !== category) return false;
      if (!needle) return true;
      return (
        product.name.toLowerCase().includes(needle) ||
        (product.sku ?? "").toLowerCase().includes(needle) ||
        (product.brand ?? "").toLowerCase().includes(needle)
      );
    });
  }, [products, query, category]);

  const stats = useMemo(
    () => ({
      total: products.length,
      low: products.filter((product) => product.is_low_stock).length,
      value: products.reduce((sum, product) => sum + Number(product.stock_value), 0),
    }),
    [products],
  );

  function openCreate() {
    const defaultUnit = units[0];
    setForm({
      ...emptyForm,
      baseUnitId: defaultUnit?.id ?? "",
      units: defaultUnit ? [{ unitId: defaultUnit.id, factor: 1, price: 0 }] : [],
    });
    setError("");
    setOpen(true);
  }

  function openEdit(product: ProductRow) {
    const baseUnitId = product.base_unit_id;
    setForm({
      id: product.id,
      name: product.name,
      sku: product.sku ?? "",
      brand: product.brand ?? "",
      categoryId: product.category_id ?? "",
      baseUnitId,
      costPrice: Number(product.cost_price),
      retailPrice: Number(product.retail_price),
      minStock: Number(product.min_stock_qty),
      openingStock: 0,
      units: [
        { unitId: baseUnitId, factor: 1, price: Number(product.retail_price) },
        ...product.units
          .filter((unit) => unit.unitId !== baseUnitId)
          .map((unit) => ({ unitId: unit.unitId, factor: Number(unit.factor), price: Number(unit.price) })),
      ],
    });
    setError("");
    setOpen(true);
  }

  function changeBaseUnit(unitId: string) {
    setForm((current) => ({
      ...current,
      baseUnitId: unitId,
      units: [{ unitId, factor: 1, price: current.retailPrice }, ...current.units.filter((unit) => unit.unitId !== unitId && current.units[0]?.unitId !== unit.unitId)],
    }));
  }

  function addUnit() {
    const used = new Set(form.units.map((unit) => unit.unitId));
    const candidate = units.find((unit) => !used.has(unit.id));
    if (!candidate) return;
    setForm((current) => ({
      ...current,
      units: [...current.units, { unitId: candidate.id, factor: 2, price: Math.round(current.retailPrice * 2) }],
    }));
  }

  function updateUnit(index: number, patch: Partial<UnitRow>) {
    setForm((current) => ({
      ...current,
      units: current.units.map((unit, i) => (i === index ? { ...unit, ...patch } : unit)),
    }));
  }

  function removeUnit(index: number) {
    setForm((current) => ({ ...current, units: current.units.filter((_, i) => i !== index) }));
  }

  async function save() {
    setBusy(true);
    setError("");
    const basePrice = Math.round(form.retailPrice);
    const unitsToSave = form.units.map((unit, index) => ({
      unitId: unit.unitId,
      factor: index === 0 ? 1 : Number(unit.factor) || 1,
      price: index === 0 ? basePrice : Math.round(Number(unit.price)),
    }));
    const result = await saveProductAction({
      id: form.id,
      name: form.name,
      sku: form.sku,
      brand: form.brand,
      categoryId: form.categoryId || null,
      baseUnitId: form.baseUnitId,
      costPrice: Number(form.costPrice),
      retailPrice: basePrice,
      minStock: Number(form.minStock),
      openingStock: form.id ? 0 : Number(form.openingStock),
      units: unitsToSave,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Produk"
        subtitle="Katalog barang, harga jual, dan satuan jual dalam satu tempat."
        action={
          canEdit ? (
            <Button onClick={openCreate}>
              <Plus size={15} /> Tambah produk
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Panel className="flex items-center justify-between">
          <div>
            <p className="text-[11.5px] text-muted">Total produk</p>
            <p className="num font-display text-[24px] text-ink">{stats.total}</p>
          </div>
          <Package size={20} className="text-faint" />
        </Panel>
        <Panel className="flex items-center justify-between">
          <div>
            <p className="text-[11.5px] text-muted">Stok menipis</p>
            <p className={cn("num font-display text-[24px]", stats.low > 0 ? "text-danger" : "text-ink")}>{stats.low}</p>
          </div>
          <span className="h-2 w-2 rounded-full bg-danger/70" />
        </Panel>
        <Panel className="flex items-center justify-between">
          <div>
            <p className="text-[11.5px] text-muted">Nilai persediaan</p>
            <p className="num font-display text-[24px] text-ink">{rupiah(stats.value)}</p>
          </div>
          <span className="text-[11px] text-muted">rata-rata</span>
        </Panel>
      </div>

      <Panel padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <SectionHeader title="Daftar produk" description={`${filtered.length} produk ditampilkan`} />
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nama atau SKU..."
                className="field h-9 w-[210px] pl-8 text-[12.5px]"
              />
            </div>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="field h-9 w-[150px] text-[12.5px]">
              <option value="Semua">Semua kategori</option>
              {categories.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Package size={26} />}
              title="Belum ada produk"
              description="Tambahkan produk pertama untuk mulai berjualan."
              action={canEdit ? <Button onClick={openCreate}>Tambah produk</Button> : null}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-line bg-paper-soft/50 text-[11px] text-muted">
                  <th className="px-5 py-2.5 font-medium">Produk</th>
                  <th className="px-3 py-2.5 font-medium">Kategori</th>
                  <th className="px-3 py-2.5 text-right font-medium">Harga jual</th>
                  <th className="px-3 py-2.5 text-right font-medium">HPP</th>
                  <th className="px-3 py-2.5 text-right font-medium">Stok</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((product) => (
                  <tr key={product.id} className="group transition-colors hover:bg-paper-soft/50">
                    <td className="px-5 py-3">
                      <p className="text-[13px] font-medium text-ink">{product.name}</p>
                      <p className="text-[11px] text-muted">
                        {product.sku ?? "Tanpa SKU"}
                        {product.brand ? ` · ${product.brand}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-[12.5px] text-ink-soft">{product.category ?? "—"}</td>
                    <td className="num px-3 py-3 text-right text-[12.5px] font-medium text-ink">{rupiah(product.retail_price)}</td>
                    <td className="num px-3 py-3 text-right text-[12px] text-muted">{rupiah(product.avg_cost)}</td>
                    <td className="px-3 py-3 text-right">
                      <p className={cn("num text-[12.5px] font-medium", product.is_low_stock ? "text-danger" : "text-ink")}>
                        {product.qty_on_hand} <span className="text-[10.5px] font-normal text-muted">{product.base_unit}</span>
                      </p>
                      <p className="text-[10px] text-faint">min {product.min_stock_qty}</p>
                    </td>
                    <td className="px-3 py-3">
                      {product.is_low_stock ? (
                        <Badge tone="danger">Menipis</Badge>
                      ) : (
                        <span className="text-[11.5px] text-muted">Aman</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {canEdit ? (
                        <button
                          onClick={() => openEdit(product)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-muted transition-colors hover:bg-canvas-deep hover:text-ink"
                          aria-label={`Ubah ${product.name}`}
                        >
                          <Pencil size={14} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? "Ubah produk" : "Tambah produk"}
        description="Harga dan satuan bisa diubah kapan saja. Riwayat penjualan tetap tersimpan."
        width="lg"
        footer={
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11.5px] text-muted">Perubahan langsung tersimpan setelah disimpan.</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button onClick={save} disabled={busy || !form.name.trim()}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                {busy ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Nama produk" className="sm:col-span-2">
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="field"
              placeholder="Contoh: Indomie Goreng"
            />
          </Field>
          <Field label="SKU">
            <input
              value={form.sku}
              onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))}
              className="field"
              placeholder="MKN-001"
            />
          </Field>
          <Field label="Merek">
            <input
              value={form.brand}
              onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))}
              className="field"
              placeholder="Opsional"
            />
          </Field>
          <Field label="Kategori">
            <select
              value={form.categoryId}
              onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
              className="field"
            >
              <option value="">Tanpa kategori</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Satuan dasar" hint="Satuan terkecil yang dihitung sebagai stok.">
            <select value={form.baseUnitId} onChange={(event) => changeBaseUnit(event.target.value)} className="field">
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} ({unit.code})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Harga beli (per satuan dasar)">
            <input
              type="number"
              min={0}
              value={form.costPrice}
              onChange={(event) => setForm((current) => ({ ...current, costPrice: Number(event.target.value) }))}
              className="field num"
            />
          </Field>
          <Field label="Harga jual (per satuan dasar)">
            <input
              type="number"
              min={0}
              value={form.retailPrice}
              onChange={(event) => setForm((current) => ({ ...current, retailPrice: Number(event.target.value) }))}
              className="field num"
            />
          </Field>
          <Field label="Stok minimum">
            <input
              type="number"
              min={0}
              value={form.minStock}
              onChange={(event) => setForm((current) => ({ ...current, minStock: Number(event.target.value) }))}
              className="field num"
            />
          </Field>
          {!form.id ? (
            <Field label="Stok awal" hint="Dicatat sebagai saldo awal persediaan.">
              <input
                type="number"
                min={0}
                value={form.openingStock}
                onChange={(event) => setForm((current) => ({ ...current, openingStock: Number(event.target.value) }))}
                className="field num"
              />
            </Field>
          ) : null}
        </div>

        <div className="mt-5 rounded-[14px] border border-line bg-paper-soft/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12.5px] font-medium text-ink-soft">Satuan jual</p>
              <p className="text-[11px] text-muted">Contoh: 1 dus = 40 pcs, dengan harga sendiri.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={addUnit} type="button">
              <Plus size={13} /> Satuan
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {form.units.map((unit, index) => {
              const info = units.find((item) => item.id === unit.unitId);
              const isBase = index === 0;
              return (
                <div key={index} className="grid grid-cols-[1fr_90px_120px_32px] items-center gap-2">
                  <select
                    value={unit.unitId}
                    disabled={isBase}
                    onChange={(event) => updateUnit(index, { unitId: event.target.value })}
                    className="field h-9 text-[12.5px] disabled:bg-canvas-deep/50 disabled:text-muted"
                  >
                    {units.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.code})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={isBase ? 1 : unit.factor}
                    disabled={isBase}
                    onChange={(event) => updateUnit(index, { factor: Number(event.target.value) })}
                    className="field num h-9 text-[12.5px] disabled:bg-canvas-deep/50"
                    placeholder="Faktor"
                    title="Isi = ... satuan dasar"
                  />
                  <input
                    type="number"
                    min={0}
                    value={isBase ? form.retailPrice : unit.price}
                    disabled={isBase}
                    onChange={(event) => updateUnit(index, { price: Number(event.target.value) })}
                    className="field num h-9 text-[12.5px] disabled:bg-canvas-deep/50"
                    placeholder="Harga"
                  />
                  <button
                    type="button"
                    disabled={isBase}
                    onClick={() => removeUnit(index)}
                    className="flex h-9 w-8 items-center justify-center rounded-[8px] text-faint transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                    aria-label="Hapus satuan"
                  >
                    <Trash2 size={14} />
                  </button>
                  {!isBase && info ? (
                    <p className="col-span-4 -mt-1 text-[10.5px] text-faint">
                      1 {info.code} = {unit.factor} {units.find((item) => item.id === form.baseUnitId)?.code}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {error ? <p className="mt-3 rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p> : null}
      </Modal>
    </div>
  );
}
