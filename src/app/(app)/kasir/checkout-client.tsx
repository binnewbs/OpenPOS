"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  Check,
  ChevronDown,
  CreditCard,
  HandCoins,
  Landmark,
  Loader2,
  Minus,
  Plus,
  Printer,
  QrCode,
  ReceiptText,
  ScanLine,
  Search,
  Trash2,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import type { SearchResult } from "@/server/services/catalog";
import type { CustomerListRow } from "@/server/queries";
import { rupiah } from "@/server/format";
import { Badge, Button, buttonClass, cn } from "@/components/ui";
import { Modal } from "@/components/modal";
import { completeSaleAction } from "@/server/actions/pos";

type CartLine = {
  productId: string;
  name: string;
  sku: string | null;
  unitId: string;
  unitCode: string;
  factor: number;
  unitPrice: number;
  qty: number;
  stock: number;
  trackStock: boolean;
  units: { unitId: string; code: string; name: string; factor: number; price: number }[];
};

type Receipt = {
  receiptNo: string;
  grandTotal: number;
  changeTotal: number;
  dueTotal: number;
  lines: { name: string; qty: number; unitCode: string; unitPrice: number }[];
  cashier: string;
  time: string;
  method: string;
};

const methods = [
  { key: "cash", label: "Tunai", icon: Banknote },
  { key: "qris", label: "QRIS", icon: QrCode },
  { key: "bank_transfer", label: "Transfer", icon: Landmark },
  { key: "ewallet", label: "E-wallet", icon: Wallet },
  { key: "credit", label: "Kasbon", icon: HandCoins },
] as const;

const methodLabel: Record<string, string> = {
  cash: "Tunai",
  qris: "QRIS",
  bank_transfer: "Transfer bank",
  ewallet: "E-wallet",
  credit: "Kasbon",
};

export function CheckoutClient({
  products,
  categories,
  customers,
  storeName,
  storeAddress,
  shiftOpen,
  cashierName,
  dateLabel,
}: {
  products: SearchResult[];
  categories: string[];
  customers: CustomerListRow[];
  storeName: string;
  storeAddress: string | null;
  shiftOpen: boolean;
  canDiscount: boolean;
  cashierName: string;
  dateLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("Semua");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<(typeof methods)[number]["key"]>("cash");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const customer = customers.find((c) => c.id === customerId);
  const availableCredit = customer ? Number(customer.available_credit) : 0;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      if (category !== "Semua" && product.category !== category) return false;
      if (!needle) return true;
      return (
        product.name.toLowerCase().includes(needle) ||
        (product.sku ?? "").toLowerCase().includes(needle) ||
        product.barcodes.some((code) => code.includes(needle))
      );
    });
  }, [products, query, category]);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, line) => sum + Math.round(line.qty * line.unitPrice), 0);
    const rounded = Math.ceil(subtotal / 100) * 100;
    return {
      subtotal,
      rounding: rounded - subtotal,
      total: subtotal,
      cashTotal: rounded,
      itemCount: cart.reduce((sum, line) => sum + line.qty, 0),
    };
  }, [cart]);

  const payable = method === "cash" ? totals.cashTotal : totals.total;
  const tenderedNumber = Number(tendered.replace(/\D/g, "") || 0);
  const change = method === "cash" ? Math.max(0, tenderedNumber - payable) : 0;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "F9") {
        event.preventDefault();
        if (cart.length) openPayment();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function addProduct(product: SearchResult, unitId?: string) {
    const unit = product.units.find((u) => u.unitId === (unitId ?? product.unitId)) ?? product.units[0];
    if (!unit) return;
    if (product.trackStock && product.stock < unit.factor) {
      setError(`Stok ${product.name} tidak cukup.`);
      return;
    }
    setError("");
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        const maxQty = product.trackStock ? product.stock / unit.factor : Number.POSITIVE_INFINITY;
        if (existing.qty + 1 > maxQty) {
          setError(`Stok ${product.name} tidak cukup.`);
          return current;
        }
        return current.map((line) =>
          line.productId === product.id ? { ...line, qty: line.qty + 1 } : line,
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          unitId: unit.unitId,
          unitCode: unit.code,
          factor: unit.factor,
          unitPrice: unit.price,
          qty: 1,
          stock: product.stock,
          trackStock: product.trackStock,
          units: product.units,
        },
      ];
    });
    setQuery("");
    searchRef.current?.focus();
  }

  function changeUnit(productId: string, unitId: string) {
    const product = products.find((p) => p.id === productId);
    const unit = product?.units.find((u) => u.unitId === unitId);
    if (!product || !unit) return;
    if (product.trackStock && unit.factor > product.stock) {
      setError(`Stok tidak cukup untuk satuan ${unit.code}.`);
      return;
    }
    setCart((current) =>
      current.map((line) =>
        line.productId === productId
          ? { ...line, unitId: unit.unitId, unitCode: unit.code, factor: unit.factor, unitPrice: unit.price }
          : line,
      ),
    );
  }

  function setQty(productId: string, qty: number) {
    setCart((current) =>
      current
        .map((line) => {
          if (line.productId !== productId) return line;
          const maxQty = line.trackStock ? line.stock / line.factor : Number.POSITIVE_INFINITY;
          const next = Math.min(Math.max(qty, 0), maxQty);
          return { ...line, qty: next };
        })
        .filter((line) => line.qty > 0),
    );
  }

  function openPayment() {
    if (!cart.length) return;
    setError("");
    setMethod("cash");
    setTendered(String(totals.cashTotal));
    setReference("");
    setPayOpen(true);
  }

  async function submitPayment() {
    if (!cart.length) return;
    setError("");
    setBusy(true);
    try {
      const payments =
        method === "credit"
          ? []
          : [
              {
                method,
                amount: method === "cash" ? totals.cashTotal : totals.total,
                tendered: method === "cash" ? Math.max(tenderedNumber, totals.cashTotal) : undefined,
                referenceNo: reference || undefined,
              },
            ];

      const result = await completeSaleAction({
        items: cart.map((line) => ({ productId: line.productId, unitId: line.unitId, qty: line.qty })),
        payments,
        customerId: customerId || null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setReceipt({
        receiptNo: result.data!.receiptNo,
        grandTotal: result.data!.grandTotal,
        changeTotal: result.data!.changeTotal,
        dueTotal: result.data!.dueTotal,
        lines: cart.map((line) => ({
          name: line.name,
          qty: line.qty,
          unitCode: line.unitCode,
          unitPrice: line.unitPrice,
        })),
        cashier: cashierName,
        time: new Intl.DateTimeFormat("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Jakarta",
        }).format(new Date()),
        method: methodLabel[method] ?? method,
      });
      setCart([]);
      setCustomerId("");
      setPayOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cart.length ? "pb-24 xl:pb-0" : undefined}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted">{dateLabel}</p>
          <h1 className="mt-1 text-[28px] leading-none text-ink">Kasir</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium",
              shiftOpen ? "bg-olive-soft text-olive" : "bg-danger-soft text-danger",
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", shiftOpen ? "bg-olive" : "bg-danger")} />
            {shiftOpen ? "Shift terbuka" : "Shift belum dibuka"}
          </span>
          {!shiftOpen ? (
            <Link href="/shift" className={buttonClass("secondary", "sm")}>
              Buka shift
            </Link>
          ) : null}
          <span className="hidden items-center gap-1 rounded-full bg-canvas-deep px-2.5 py-1 text-[11px] text-muted sm:inline-flex">
            <ScanLine size={12} /> Scanner siap
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1fr_392px]">
        <section className="min-w-0">
          <div className="relative">
            <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
            <input
              ref={searchRef}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const exact = products.find((product) => product.barcodes.includes(query.trim()));
                  const target = exact ?? filtered[0];
                  if (target) addProduct(target);
                }
                if (event.key === "Escape") setQuery("");
              }}
              placeholder="Cari produk, SKU, atau scan barcode..."
              className="field h-12 pl-11 pr-4 text-[14px] sm:pr-24"
            />
            <div className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1.5 sm:flex">
              <kbd className="rounded-[5px] border border-line-strong bg-paper-soft px-1.5 py-0.5 text-[10px] text-muted">F2</kbd>
              <span className="text-[11px] text-faint">cari</span>
            </div>
          </div>

          <div className="scroll-thin mt-3 flex items-center gap-2 overflow-x-auto pb-1">
            {["Semua", ...categories].map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                  category === item
                    ? "border-ink/70 bg-ink text-rail-ink"
                    : "border-line bg-paper text-ink-soft hover:border-line-strong hover:text-ink",
                )}
              >
                {item}
              </button>
            ))}
          </div>

          {error && !payOpen ? (
            <div className="mt-3 flex items-center justify-between rounded-[10px] bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger">
              {error}
              <button onClick={() => setError("")} aria-label="Tutup pesan">
                <X size={14} />
              </button>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((product) => {
              const outOfStock = product.trackStock && product.stock < 1;
              const low = product.trackStock && product.stock <= product.factor * 2;
              return (
                <button
                  key={product.id}
                  onClick={() => addProduct(product)}
                  disabled={outOfStock}
                  className={cn(
                    "group flex min-h-[116px] flex-col rounded-[14px] border border-line bg-paper p-3.5 text-left transition-all",
                    "hover:border-accent/45 hover:bg-paper-soft hover:shadow-[0_10px_24px_-20px_rgba(43,33,24,0.7)]",
                    "disabled:cursor-not-allowed disabled:opacity-45",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">{product.name}</p>
                      <p className="mt-1 text-[10.5px] text-muted">{product.category ?? "Tanpa kategori"}</p>
                    </div>
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-faint transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-white">
                      <Plus size={13} />
                    </span>
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                    <p className="num text-[14px] font-semibold text-ink">{rupiah(product.price)}</p>
                    <p
                      className={cn(
                        "text-[10.5px]",
                        outOfStock ? "text-danger" : low ? "text-accent-deep" : "text-muted",
                      )}
                    >
                      {product.trackStock ? `${product.stock} ${product.unitCode}` : "Jasa"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div className="mt-4 rounded-[14px] border border-dashed border-line-strong px-6 py-12 text-center">
              <p className="font-display text-[17px] text-ink">Produk tidak ditemukan</p>
              <p className="mt-1 text-[12.5px] text-muted">Coba kata kunci lain atau scan barcode produk.</p>
            </div>
          ) : null}
        </section>

        <aside id="nota" className="min-w-0 xl:sticky xl:top-6">
          <div className="panel overflow-hidden p-0">
            <div className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <ReceiptText size={15} className="text-accent" />
                  <h2 className="font-display text-[18px] leading-none text-ink">Nota baru</h2>
                </div>
                <p className="mt-1.5 text-[11.5px] text-muted">
                  {totals.itemCount} item · {cart.length} produk
                </p>
              </div>
              {cart.length ? (
                <button
                  onClick={() => setCart([])}
                  className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 size={13} /> Kosongkan
                </button>
              ) : null}
            </div>

            <div className="border-b border-dashed border-line-strong px-5 py-3">
              <div className="relative">
                <UserRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                <select
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  className="field h-9 appearance-none pl-9 pr-8 text-[12.5px]"
                >
                  <option value="">Pelanggan umum</option>
                  {customers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.credit_limit > 0 ? ` · kasbon ${rupiah(item.available_credit)}` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" />
              </div>
            </div>

            <div className="scroll-thin max-h-[calc(100vh-390px)] min-h-[180px] overflow-y-auto px-5">
              {cart.length === 0 ? (
                <div className="flex h-[180px] flex-col items-center justify-center text-center">
                  <ReceiptText size={26} className="text-line-strong" />
                  <p className="mt-2 text-[12.5px] text-muted">Nota masih kosong</p>
                  <p className="mt-0.5 max-w-[24ch] text-[11px] text-faint">
                    Pilih produk atau scan barcode untuk mulai.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-dashed divide-line">
                  {cart.map((line) => (
                    <div key={line.productId} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-medium leading-snug text-ink">{line.name}</p>
                          <p className="num mt-0.5 text-[10.5px] text-muted">
                            {rupiah(line.unitPrice)} / {line.unitCode}
                          </p>
                        </div>
                        <button
                          onClick={() => setCart((current) => current.filter((l) => l.productId !== line.productId))}
                          className="text-faint transition-colors hover:text-danger"
                          aria-label={`Hapus ${line.name}`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setQty(line.productId, line.qty - 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-line text-ink-soft transition-colors hover:bg-canvas-deep"
                            aria-label="Kurangi"
                          >
                            <Minus size={12} />
                          </button>
                          <input
                            value={line.qty}
                            onChange={(event) => setQty(line.productId, Number(event.target.value))}
                            inputMode="decimal"
                            className="num h-7 w-11 rounded-[7px] border border-line bg-paper text-center text-[12px]"
                            aria-label="Jumlah"
                          />
                          <button
                            onClick={() => setQty(line.productId, line.qty + 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-line text-ink-soft transition-colors hover:bg-canvas-deep"
                            aria-label="Tambah"
                          >
                            <Plus size={12} />
                          </button>
                          {line.units.length > 1 ? (
                            <select
                              value={line.unitId}
                              onChange={(event) => changeUnit(line.productId, event.target.value)}
                              className="ml-1 h-7 rounded-[7px] border border-line bg-paper px-1 text-[11px] text-ink-soft"
                              aria-label="Satuan"
                            >
                              {line.units.map((unit) => (
                                <option key={unit.unitId} value={unit.unitId}>
                                  {unit.code}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                        <p className="num text-[12.5px] font-semibold text-ink">
                          {rupiah(Math.round(line.qty * line.unitPrice))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-line-strong px-5 py-3.5">
              <div className="flex items-center justify-between text-[12px] text-muted">
                <span>Subtotal</span>
                <span className="num text-ink-soft">{rupiah(totals.subtotal)}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[12px] text-muted">
                <span>Pembulatan tunai</span>
                <span className="num text-ink-soft">{totals.rounding > 0 ? `+ ${rupiah(totals.rounding)}` : "—"}</span>
              </div>
              <div className="mt-3 flex items-end justify-between border-t border-line pt-3">
                <span className="text-[13px] font-medium text-ink-soft">Total</span>
                <span className="num font-display text-[27px] leading-none text-ink">{rupiah(totals.cashTotal)}</span>
              </div>
            </div>

            <div className="px-5 pb-5">
              <button
                onClick={openPayment}
                disabled={!cart.length || !shiftOpen}
                className={buttonClass("primary", "lg", "w-full")}
              >
                Bayar <span className="num font-normal opacity-80">{rupiah(totals.cashTotal)}</span>
              </button>
              <p className="mt-2 text-center text-[10.5px] text-faint">
                Tekan <kbd className="rounded border border-line px-1">F9</kbd> untuk membuka pembayaran
              </p>
            </div>
          </div>
        </aside>
      </div>

      {cart.length ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 px-4 py-3 shadow-[0_-12px_30px_-20px_rgba(43,33,24,0.5)] backdrop-blur xl:hidden">
          <div className="mx-auto flex max-w-[560px] items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-muted">{totals.itemCount} item · {cart.length} produk</p>
              <p className="num font-display text-[20px] leading-tight text-ink">{rupiah(totals.cashTotal)}</p>
            </div>
            <Button onClick={openPayment} disabled={!shiftOpen} className="min-w-[150px]">
              Bayar
            </Button>
          </div>
        </div>
      ) : null}

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Pembayaran"
        description={`${totals.itemCount} item · ${customer ? customer.name : "Pelanggan umum"}`}
        width="md"
        footer={
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11.5px] text-muted">
              {method === "credit" ? (
                <span>
                  Sisa kasbon setelah ini:{" "}
                  <span className="num text-ink">{rupiah(Math.max(0, availableCredit - totals.total))}</span>
                </span>
              ) : (
                <span className="hidden sm:inline">Tekan Esc untuk menutup</span>
              )}
            </div>
            <Button
              onClick={submitPayment}
              disabled={busy || (method === "credit" && !customerId)}
              size="lg"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {busy ? "Menyimpan..." : method === "credit" ? "Simpan kasbon" : "Selesaikan pembayaran"}
            </Button>
          </div>
        }
      >
        <div className="rounded-[14px] bg-paper-soft px-5 py-4">
          <p className="text-[12px] text-muted">Total tagihan</p>
          <p className="num mt-1 font-display text-[32px] leading-none text-ink">{rupiah(payable)}</p>
          {method === "cash" && totals.rounding > 0 ? (
            <p className="mt-1 text-[11px] text-muted">Termasuk pembulatan {rupiah(totals.rounding)}</p>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {methods.map((item) => {
            const Icon = item.icon;
            const active = method === item.key;
            return (
              <button
                key={item.key}
                onClick={() => {
                  setMethod(item.key);
                  setError("");
                  if (item.key === "cash") setTendered(String(totals.cashTotal));
                }}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-[11px] border px-2 py-3 text-[11.5px] transition-colors",
                  active
                    ? "border-accent bg-accent-soft font-medium text-accent-deep"
                    : "border-line bg-paper text-ink-soft hover:border-line-strong",
                )}
              >
                <Icon size={17} strokeWidth={1.7} />
                {item.label}
              </button>
            );
          })}
        </div>

        {method === "cash" ? (
          <div className="mt-4">
            <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">Uang diterima</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] text-muted">Rp</span>
              <input
                value={tendered ? new Intl.NumberFormat("id-ID").format(tenderedNumber) : ""}
                onChange={(event) => setTendered(event.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className="field h-12 num pl-10 text-right text-[20px] font-semibold"
                placeholder="0"
                autoFocus
              />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              <button onClick={() => setTendered(String(totals.cashTotal))} className={buttonClass("quiet", "sm")}>
                Uang pas
              </button>
              <button onClick={() => setTendered("50000")} className={buttonClass("quiet", "sm")}>
                50 rb
              </button>
              <button onClick={() => setTendered("100000")} className={buttonClass("quiet", "sm")}>
                100 rb
              </button>
              <button
                onClick={() => setTendered(String(Math.ceil((payable + 1) / 10000) * 10000))}
                className={buttonClass("quiet", "sm")}
              >
                Bulatkan
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-[11px] border border-line bg-paper px-4 py-3">
              <span className="text-[12.5px] text-muted">Kembalian</span>
              <span className={cn("num font-display text-[22px]", change > 0 ? "text-olive" : "text-ink")}>
                {rupiah(change)}
              </span>
            </div>
          </div>
        ) : null}

        {method !== "cash" && method !== "credit" ? (
          <div className="mt-4">
            <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">
              Nomor referensi <span className="font-normal text-faint">(opsional)</span>
            </label>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className="field"
              placeholder={method === "qris" ? "ID transaksi QRIS" : "Nomor referensi / berita"}
            />
            <p className="mt-2 text-[11.5px] text-muted">Pembayaran dianggap lunas setelah dikonfirmasi.</p>
          </div>
        ) : null}

        {method === "credit" ? (
          <div className="mt-4">
            <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">Pelanggan kasbon</label>
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="field">
              <option value="">Pilih pelanggan...</option>
              {customers
                .filter((item) => item.credit_limit > 0)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — tersedia {rupiah(item.available_credit)}
                  </option>
                ))}
            </select>
            {customer ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-[10px] bg-paper-soft px-3 py-2.5">
                  <p className="text-[10.5px] text-muted">Batas kasbon</p>
                  <p className="num text-[13px] font-medium text-ink">{rupiah(customer.credit_limit)}</p>
                </div>
                <div className="rounded-[10px] bg-paper-soft px-3 py-2.5">
                  <p className="text-[10.5px] text-muted">Sisa tersedia</p>
                  <p className="num text-[13px] font-medium text-ink">{rupiah(customer.available_credit)}</p>
                </div>
              </div>
            ) : null}
            {customer && totals.total > availableCredit ? (
              <p className="mt-2 text-[12px] text-danger">Kasbon melebihi sisa batas pelanggan.</p>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="mt-3 rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p> : null}
      </Modal>

      <Modal
        open={Boolean(receipt)}
        onClose={() => setReceipt(null)}
        title="Pembayaran berhasil"
        description={receipt ? receipt.receiptNo : undefined}
        width="sm"
        footer={
          <div className="flex items-center gap-2">
            <Button onClick={() => setReceipt(null)} className="flex-1">
              Transaksi baru
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={15} /> Cetak
            </Button>
          </div>
        }
      >
        {receipt ? (
          <div className="print-area mx-auto max-w-[300px] rounded-[8px] border border-line bg-paper p-5">
            <div className="text-center">
              <p className="font-display text-[18px] text-ink">{storeName}</p>
              {storeAddress ? <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{storeAddress}</p> : null}
              <p className="mt-2 text-[10px] text-muted">Nota {receipt.receiptNo}</p>
              <p className="text-[10px] text-muted">
                {receipt.time} · Kasir {receipt.cashier}
              </p>
            </div>
            <div className="my-3 border-t border-dashed border-line-strong" />
            <div className="space-y-1.5">
              {receipt.lines.map((line, index) => (
                <div key={index} className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span className="text-ink-soft">
                    {line.name} <span className="text-muted">×{line.qty} {line.unitCode}</span>
                  </span>
                  <span className="num text-ink">{rupiah(Math.round(line.qty * line.unitPrice))}</span>
                </div>
              ))}
            </div>
            <div className="my-3 border-t border-dashed border-line-strong" />
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-medium text-ink-soft">Total</span>
              <span className="num font-display text-[19px] text-ink">{rupiah(receipt.grandTotal)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
              <span>{receipt.method}</span>
              <span className="num">{rupiah(receipt.grandTotal - receipt.dueTotal)}</span>
            </div>
            {receipt.changeTotal > 0 ? (
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                <span>Kembalian</span>
                <span className="num">{rupiah(receipt.changeTotal)}</span>
              </div>
            ) : null}
            {receipt.dueTotal > 0 ? (
              <div className="mt-1 flex items-center justify-between text-[11px] text-danger">
                <span>Kasbon</span>
                <span className="num">{rupiah(receipt.dueTotal)}</span>
              </div>
            ) : null}
            <p className="mt-4 text-center text-[9.5px] text-muted">Terima kasih sudah berbelanja</p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
