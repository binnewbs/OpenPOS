"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Banknote, Loader2, Plus, Receipt } from "lucide-react";
import { Badge, Button, Field, PageHeader, Panel, SectionHeader, cn } from "@/components/ui";
import { Modal } from "@/components/modal";
import { closeShiftAction, openShiftAction } from "@/server/actions/pos";
import { createExpenseAction } from "@/server/actions/settings";
import { formatDateTime, formatTime, rupiah } from "@/server/format";

type Shift = {
  id: string;
  register_name: string;
  opened_at: string;
  opening_cash: number;
  expected_cash: number;
  cashier_name: string;
};

type Movement = {
  id: string;
  type: string;
  amount: number;
  reference_type: string | null;
  note: string | null;
  business_date: string;
  created_at: string;
  user_name: string | null;
};

type Summary = {
  transactions: number;
  gross: number;
  cogs: number;
  credit: number;
  payments: { method: string; amount: number; count: number }[];
} | null;

type History = {
  id: string;
  register_name: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  expected_cash: number | null;
  counted_cash: number | null;
  difference: number | null;
  status: string;
  cashier_name: string;
};

type Expense = {
  id: string;
  amount: number;
  description: string;
  paid_from: string;
  business_date: string;
  created_at: string;
  category: string;
  created_by_name: string | null;
};

const movementLabel: Record<string, string> = {
  sale: "Penjualan tunai",
  refund: "Refund",
  credit_payment: "Bayar kasbon",
  supplier_payment: "Bayar supplier",
  expense: "Pengeluaran",
  cash_in: "Kas masuk",
  cash_out: "Kas keluar",
  adjustment: "Penyesuaian",
};

const methodLabel: Record<string, string> = {
  cash: "Tunai",
  bank_transfer: "Transfer",
  ewallet: "E-wallet",
  qris: "QRIS",
  other: "Lainnya",
};

export function ShiftManager({
  shift,
  movements,
  salesSummary,
  history,
  expenses,
  categories,
  canOpen,
  canClose,
  canExpense,
}: {
  shift: Shift | null;
  movements: Movement[];
  salesSummary: Summary;
  history: History[];
  expenses: Expense[];
  categories: { id: string; name: string }[];
  canOpen: boolean;
  canClose: boolean;
  canExpense: boolean;
}) {
  const router = useRouter();
  const [openCash, setOpenCash] = useState("250000");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expense, setExpense] = useState({
    categoryId: categories[0]?.id ?? "",
    amount: "",
    description: "",
    paidFrom: "cash_drawer" as "cash_drawer" | "bank" | "ewallet" | "other",
  });

  const expected = shift?.expected_cash ?? 0;
  const difference = counted ? Number(counted) - expected : 0;
  const cashIn = movements.filter((item) => Number(item.amount) > 0).reduce((sum, item) => sum + Number(item.amount), 0);
  const cashOut = movements.filter((item) => Number(item.amount) < 0).reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0);

  async function open() {
    setBusy(true);
    setError("");
    const result = await openShiftAction({ openingCash: Number(openCash) });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function close() {
    setBusy(true);
    setError("");
    const result = await closeShiftAction({ countedCash: Number(counted), note });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCounted("");
    setNote("");
    router.refresh();
  }

  async function saveExpense() {
    setBusy(true);
    setError("");
    const result = await createExpenseAction({
      categoryId: expense.categoryId,
      amount: Number(expense.amount),
      description: expense.description,
      paidFrom: expense.paidFrom,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setExpenseOpen(false);
    setExpense({ categoryId: categories[0]?.id ?? "", amount: "", description: "", paidFrom: "cash_drawer" });
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Shift & kas"
        subtitle="Cocokkan uang di laci sebelum menutup hari. Semua selisih tercatat."
      />

      {!shift ? (
        <Panel className="mx-auto max-w-[460px]">
          <div className="flex flex-col items-center py-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-deep">
              <Banknote size={22} />
            </div>
            <h2 className="mt-3 font-display text-[22px] text-ink">Belum ada shift terbuka</h2>
            <p className="mt-1 max-w-[34ch] text-[12.5px] text-muted">
              Masukkan modal awal di laci untuk mulai menerima pembayaran tunai.
            </p>
          </div>
          <div className="mt-5 space-y-3">
            <Field label="Modal awal laci">
              <input
                type="number"
                min={0}
                value={openCash}
                onChange={(event) => setOpenCash(event.target.value)}
                className="field num text-[18px] font-semibold"
              />
            </Field>
            <Button className="w-full" size="lg" onClick={open} disabled={busy || !canOpen}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : null} Buka shift
            </Button>
            {!canOpen ? <p className="text-center text-[11.5px] text-muted">Kamu tidak punya izin membuka shift.</p> : null}
            {error ? <p className="rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p> : null}
          </div>
        </Panel>
      ) : (
        <>
          <section className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.3fr_1fr]">
            <Panel>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[12.5px] text-muted">Kas laci diperkirakan</p>
                  <p className="num mt-1 font-display text-[38px] leading-none text-ink">{rupiah(expected)}</p>
                  <p className="mt-1.5 text-[11.5px] text-muted">
                    {shift.register_name} · dibuka {formatTime(shift.opened_at)} oleh {shift.cashier_name.split(" ")[0]}
                  </p>
                </div>
                <Badge tone="olive">Shift terbuka</Badge>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
                <div>
                  <p className="text-[10.5px] text-muted">Modal awal</p>
                  <p className="num text-[14px] font-medium text-ink">{rupiah(shift.opening_cash)}</p>
                </div>
                <div>
                  <p className="text-[10.5px] text-muted">Kas masuk</p>
                  <p className="num text-[14px] font-medium text-olive">+{rupiah(cashIn)}</p>
                </div>
                <div>
                  <p className="text-[10.5px] text-muted">Kas keluar</p>
                  <p className="num text-[14px] font-medium text-danger">{cashOut ? `-${rupiah(cashOut)}` : "—"}</p>
                </div>
              </div>
            </Panel>

            <Panel>
              <SectionHeader title="Tutup shift" description="Hitung uang fisik di laci." />
              <div className="mt-4 space-y-3">
                <Field label="Uang fisik dihitung">
                  <input
                    type="number"
                    min={0}
                    value={counted}
                    onChange={(event) => setCounted(event.target.value)}
                    className="field num text-[18px] font-semibold"
                    placeholder="0"
                  />
                </Field>
                <div className="flex items-center justify-between rounded-[10px] bg-paper-soft px-3.5 py-2.5 text-[12px]">
                  <span className="text-muted">Selisih</span>
                  <span className={cn("num font-medium", difference === 0 ? "text-ink" : difference > 0 ? "text-olive" : "text-danger")}>
                    {counted ? `${difference > 0 ? "+" : ""}${rupiah(difference)}` : "—"}
                  </span>
                </div>
                <Field label="Catatan (opsional)">
                  <input value={note} onChange={(event) => setNote(event.target.value)} className="field" placeholder="Contoh: uang kembalian kurang" />
                </Field>
                <Button className="w-full" onClick={close} disabled={busy || !counted || !canClose}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : null} Tutup shift
                </Button>
                {error ? <p className="rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p> : null}
              </div>
            </Panel>
          </section>

          <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
            <Panel padded={false}>
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <SectionHeader title="Arus kas shift" description={`${movements.length} mutasi`} />
                {canExpense ? (
                  <Button variant="secondary" size="sm" onClick={() => { setExpenseOpen(true); setError(""); }}>
                    <Plus size={13} /> Pengeluaran
                  </Button>
                ) : null}
              </div>
              <div className="scroll-thin max-h-[360px] overflow-y-auto">
                {movements.length === 0 ? (
                  <p className="px-5 py-10 text-center text-[12.5px] text-muted">Belum ada mutasi kas.</p>
                ) : (
                  <div className="divide-y divide-line">
                    {movements.map((movement) => {
                      const positive = Number(movement.amount) > 0;
                      return (
                        <div key={movement.id} className="flex items-center justify-between gap-3 px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", positive ? "bg-olive-soft text-olive" : "bg-danger-soft text-danger")}>
                              {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                            </span>
                            <div>
                              <p className="text-[12.5px] font-medium text-ink">{movementLabel[movement.type] ?? movement.type}</p>
                              <p className="text-[10.5px] text-muted">
                                {formatTime(movement.created_at)}
                                {movement.note ? ` · ${movement.note}` : ""}
                                {movement.user_name ? ` · ${movement.user_name.split(" ")[0]}` : ""}
                              </p>
                            </div>
                          </div>
                          <p className={cn("num text-[12.5px] font-medium", positive ? "text-olive" : "text-danger")}>
                            {positive ? "+" : ""}{rupiah(movement.amount)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Panel>

            <Panel>
              <SectionHeader title="Ringkasan penjualan" description="Sejak shift dibuka" />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[10px] bg-paper-soft px-3.5 py-3">
                  <p className="text-[10.5px] text-muted">Transaksi</p>
                  <p className="num font-display text-[20px] text-ink">{salesSummary?.transactions ?? 0}</p>
                </div>
                <div className="rounded-[10px] bg-paper-soft px-3.5 py-3">
                  <p className="text-[10.5px] text-muted">Penjualan</p>
                  <p className="num font-display text-[20px] text-ink">{rupiah(salesSummary?.gross ?? 0)}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2.5">
                {(salesSummary?.payments ?? []).map((payment) => (
                  <div key={payment.method} className="flex items-center justify-between text-[12px]">
                    <span className="text-ink-soft">{methodLabel[payment.method] ?? payment.method}</span>
                    <span className="num text-ink">{rupiah(payment.amount)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </section>
        </>
      )}

      <Panel className="mt-4" padded={false}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <SectionHeader title="Riwayat shift" description="10 shift terakhir" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead>
              <tr className="border-b border-line bg-paper-soft/50 text-[11px] text-muted">
                <th className="px-5 py-2.5 font-medium">Mulai</th>
                <th className="px-3 py-2.5 font-medium">Kasir</th>
                <th className="px-3 py-2.5 text-right font-medium">Modal</th>
                <th className="px-3 py-2.5 text-right font-medium">Perkiraan</th>
                <th className="px-3 py-2.5 text-right font-medium">Dihitung</th>
                <th className="px-3 py-2.5 text-right font-medium">Selisih</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {history.map((item) => (
                <tr key={item.id} className="text-[12px]">
                  <td className="px-5 py-2.5 text-muted">{formatDateTime(item.opened_at)}</td>
                  <td className="px-3 py-2.5 text-ink-soft">{item.cashier_name}</td>
                  <td className="num px-3 py-2.5 text-right text-ink-soft">{rupiah(item.opening_cash)}</td>
                  <td className="num px-3 py-2.5 text-right text-ink-soft">{item.expected_cash == null ? "—" : rupiah(item.expected_cash)}</td>
                  <td className="num px-3 py-2.5 text-right text-ink-soft">{item.counted_cash == null ? "—" : rupiah(item.counted_cash)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {item.difference == null ? (
                      <span className="text-faint">—</span>
                    ) : (
                      <span className={cn("num font-medium", item.difference === 0 ? "text-ink" : item.difference > 0 ? "text-olive" : "text-danger")}>
                        {item.difference > 0 ? "+" : ""}{rupiah(item.difference)}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2.5">
                    <Badge tone={item.status === "open" ? "olive" : "neutral"}>{item.status === "open" ? "Buka" : "Tutup"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="mt-4" padded={false}>
        <div className="border-b border-line px-5 py-4">
          <SectionHeader title="Pengeluaran terakhir" description="Biaya operasional toko" />
        </div>
        <div className="divide-y divide-line">
          {expenses.length === 0 ? (
            <p className="px-5 py-8 text-center text-[12.5px] text-muted">Belum ada pengeluaran.</p>
          ) : (
            expenses.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-canvas-deep text-muted">
                    <Receipt size={14} />
                  </span>
                  <div>
                    <p className="text-[12.5px] font-medium text-ink">{item.description}</p>
                    <p className="text-[10.5px] text-muted">
                      {item.category} · {item.paid_from.replaceAll("_", " ")} · {formatDateTime(item.created_at)}
                    </p>
                  </div>
                </div>
                <p className="num text-[12.5px] font-medium text-danger">-{rupiah(item.amount)}</p>
              </div>
            ))
          )}
        </div>
      </Panel>

      <Modal
        open={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        title="Catat pengeluaran"
        description="Pengeluaran dari laci akan mengurangi kas shift ini."
        width="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setExpenseOpen(false)}>Batal</Button>
            <Button onClick={saveExpense} disabled={busy || !expense.amount || !expense.description}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : null} Simpan
            </Button>
          </div>
        }
      >
        <div className="space-y-3.5">
          <Field label="Kategori">
            <select
              value={expense.categoryId}
              onChange={(event) => setExpense({ ...expense, categoryId: event.target.value })}
              className="field"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nominal">
            <input
              type="number"
              min={0}
              value={expense.amount}
              onChange={(event) => setExpense({ ...expense, amount: event.target.value })}
              className="field num text-[18px] font-semibold"
              autoFocus
            />
          </Field>
          <Field label="Keterangan">
            <input
              value={expense.description}
              onChange={(event) => setExpense({ ...expense, description: event.target.value })}
              className="field"
              placeholder="Contoh: beli kantong plastik"
            />
          </Field>
          <Field label="Sumber dana">
            <select
              value={expense.paidFrom}
              onChange={(event) => setExpense({ ...expense, paidFrom: event.target.value as typeof expense.paidFrom })}
              className="field"
            >
              <option value="cash_drawer">Laci kas</option>
              <option value="bank">Bank</option>
              <option value="ewallet">E-wallet</option>
              <option value="other">Lainnya</option>
            </select>
          </Field>
          {error ? <p className="rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
