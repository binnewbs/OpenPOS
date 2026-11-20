"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HandCoins, Loader2, Plus, Search, UserRound, Wallet } from "lucide-react";
import { Badge, Button, EmptyState, Field, PageHeader, Panel, SectionHeader, cn } from "@/components/ui";
import { Modal } from "@/components/modal";
import { createCustomerAction } from "@/server/actions/catalog";
import { creditPaymentAction } from "@/server/actions/pos";
import { formatDateTime, rupiah } from "@/server/format";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  credit_limit: number;
  credit_balance: number;
  credit_term_days: number;
  available_credit: number;
  overdue_amount: number;
};

type Ledger = {
  id: string;
  entry_type: string;
  amount: number;
  balance_after: number;
  due_date: string | null;
  note: string | null;
  created_at: string;
  receipt_no: string | null;
};

type Detail = { customer: Customer; ledger: Ledger[] };

const entryLabel: Record<string, string> = {
  opening: "Saldo awal",
  charge: "Kasbon baru",
  payment: "Pembayaran",
  adjustment: "Penyesuaian",
  write_off: "Hapus buku",
  return_credit: "Retur",
  void: "Pembatalan",
};

export function CustomerManager({
  details,
  canCreate,
  canReceivePayment,
}: {
  details: Detail[];
  canCreate: boolean;
  canReceivePayment: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [payCustomer, setPayCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", creditLimit: 0, creditTermDays: 30 });
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "bank_transfer" | "ewallet" | "qris">("cash");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const totals = useMemo(
    () => ({
      receivable: details.reduce((sum, item) => sum + Number(item.customer.credit_balance), 0),
      overdue: details.reduce((sum, item) => sum + Number(item.customer.overdue_amount), 0),
      withCredit: details.filter((item) => item.customer.credit_balance > 0).length,
    }),
    [details],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return details;
    return details.filter(
      (item) =>
        item.customer.name.toLowerCase().includes(needle) ||
        (item.customer.phone ?? "").includes(needle),
    );
  }, [details, query]);

  async function createCustomer() {
    setBusy(true);
    setError("");
    const result = await createCustomerAction(form);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCreateOpen(false);
    setForm({ name: "", phone: "", address: "", creditLimit: 0, creditTermDays: 30 });
    router.refresh();
  }

  async function receivePayment() {
    if (!payCustomer) return;
    setBusy(true);
    setError("");
    const result = await creditPaymentAction({
      customerId: payCustomer.id,
      amount: Number(amount),
      method,
      referenceNo: reference || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPayCustomer(null);
    setAmount("");
    setReference("");
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Pelanggan"
        subtitle="Catat kasbon dengan rapi, lihat siapa yang perlu ditagih lebih dulu."
        action={
          canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={15} /> Pelanggan baru
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Panel>
          <p className="text-[11.5px] text-muted">Total piutang</p>
          <p className="num mt-1 font-display text-[25px] text-ink">{rupiah(totals.receivable)}</p>
          <p className="mt-1 text-[11px] text-muted">{totals.withCredit} pelanggan punya kasbon</p>
        </Panel>
        <Panel>
          <p className="text-[11.5px] text-muted">Lewat tempo</p>
          <p className={cn("num mt-1 font-display text-[25px]", totals.overdue > 0 ? "text-danger" : "text-ink")}>
            {rupiah(totals.overdue)}
          </p>
          <p className="mt-1 text-[11px] text-muted">perlu ditagih</p>
        </Panel>
        <Panel>
          <p className="text-[11.5px] text-muted">Jumlah pelanggan</p>
          <p className="num mt-1 font-display text-[25px] text-ink">{details.length}</p>
          <p className="mt-1 text-[11px] text-muted">terdaftar di toko ini</p>
        </Panel>
      </div>

      <Panel padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <SectionHeader title="Buku pelanggan" description={`${filtered.length} pelanggan`} />
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nama atau nomor HP..."
              className="field h-9 w-[230px] pl-8 text-[12.5px]"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<UserRound size={26} />}
              title="Belum ada pelanggan"
              description="Tambahkan pelanggan supaya kasbon dan pembayaran tercatat."
              action={canCreate ? <Button onClick={() => setCreateOpen(true)}>Pelanggan baru</Button> : null}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-line bg-paper-soft/50 text-[11px] text-muted">
                  <th className="px-5 py-2.5 font-medium">Pelanggan</th>
                  <th className="px-3 py-2.5 text-right font-medium">Kasbon</th>
                  <th className="px-3 py-2.5 text-right font-medium">Batas</th>
                  <th className="px-3 py-2.5 text-right font-medium">Tersedia</th>
                  <th className="px-3 py-2.5 text-right font-medium">Lewat tempo</th>
                  <th className="px-5 py-2.5 text-right font-medium">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map(({ customer }) => (
                  <tr key={customer.id} className="transition-colors hover:bg-paper-soft/50">
                    <td className="px-5 py-3">
                      <button onClick={() => setDetail({ customer, ledger: details.find((d) => d.customer.id === customer.id)?.ledger ?? [] })} className="text-left">
                        <p className="text-[13px] font-medium text-ink hover:text-accent-deep">{customer.name}</p>
                        <p className="text-[11px] text-muted">{customer.phone ?? "Tanpa nomor HP"}</p>
                      </button>
                    </td>
                    <td className="num px-3 py-3 text-right text-[13px] font-medium text-ink">{rupiah(customer.credit_balance)}</td>
                    <td className="num px-3 py-3 text-right text-[12px] text-muted">{rupiah(customer.credit_limit)}</td>
                    <td className="num px-3 py-3 text-right text-[12px] text-ink-soft">{rupiah(customer.available_credit)}</td>
                    <td className="px-3 py-3 text-right">
                      {Number(customer.overdue_amount) > 0 ? (
                        <Badge tone="danger">{rupiah(customer.overdue_amount)}</Badge>
                      ) : (
                        <span className="text-[12px] text-faint">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setDetail({ customer, ledger: details.find((d) => d.customer.id === customer.id)?.ledger ?? [] }); }}>
                          Detail
                        </Button>
                        {canReceivePayment && customer.credit_balance > 0 ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setPayCustomer(customer);
                              setAmount(String(customer.credit_balance));
                              setMethod("cash");
                              setReference("");
                              setError("");
                            }}
                          >
                            <HandCoins size={13} /> Bayar
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Pelanggan baru"
        description="Batas kasbon 0 berarti pelanggan hanya bisa bayar tunai."
        width="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button onClick={createCustomer} disabled={busy || !form.name.trim()}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : null} Simpan
            </Button>
          </div>
        }
      >
        <div className="space-y-3.5">
          <Field label="Nama pelanggan">
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="field" autoFocus />
          </Field>
          <Field label="Nomor HP">
            <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="field" placeholder="0812..." />
          </Field>
          <Field label="Alamat">
            <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="field" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Batas kasbon">
              <input type="number" min={0} value={form.creditLimit} onChange={(event) => setForm({ ...form, creditLimit: Number(event.target.value) })} className="field num" />
            </Field>
            <Field label="Tempo (hari)">
              <input type="number" min={0} value={form.creditTermDays} onChange={(event) => setForm({ ...form, creditTermDays: Number(event.target.value) })} className="field num" />
            </Field>
          </div>
          {error ? <p className="rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p> : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(payCustomer)}
        onClose={() => setPayCustomer(null)}
        title="Terima pembayaran kasbon"
        description={payCustomer ? `${payCustomer.name} · sisa ${rupiah(payCustomer.credit_balance)}` : undefined}
        width="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPayCustomer(null)}>Batal</Button>
            <Button onClick={receivePayment} disabled={busy || !Number(amount)}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : null} Simpan pembayaran
            </Button>
          </div>
        }
      >
        <div className="space-y-3.5">
          <Field label="Jumlah diterima">
            <input type="number" min={0} value={amount} onChange={(event) => setAmount(event.target.value)} className="field num text-[18px] font-semibold" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Metode">
              <select value={method} onChange={(event) => setMethod(event.target.value as typeof method)} className="field">
                <option value="cash">Tunai</option>
                <option value="qris">QRIS</option>
                <option value="bank_transfer">Transfer bank</option>
                <option value="ewallet">E-wallet</option>
              </select>
            </Field>
            <Field label="Referensi">
              <input value={reference} onChange={(event) => setReference(event.target.value)} className="field" placeholder="Opsional" />
            </Field>
          </div>
          {error ? <p className="rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p> : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.customer.name ?? "Detail pelanggan"}
        description={detail ? `${detail.customer.phone ?? "Tanpa nomor HP"} · tempo ${detail.customer.credit_term_days} hari` : undefined}
        width="md"
        footer={
          detail && canReceivePayment && detail.customer.credit_balance > 0 ? (
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setPayCustomer(detail.customer);
                  setAmount(String(detail.customer.credit_balance));
                  setDetail(null);
                }}
              >
                <HandCoins size={15} /> Terima pembayaran
              </Button>
            </div>
          ) : null
        }
      >
        {detail ? (
          <div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-[10px] bg-paper-soft px-3 py-2.5">
                <p className="text-[10.5px] text-muted">Kasbon</p>
                <p className="num text-[15px] font-medium text-ink">{rupiah(detail.customer.credit_balance)}</p>
              </div>
              <div className="rounded-[10px] bg-paper-soft px-3 py-2.5">
                <p className="text-[10.5px] text-muted">Tersedia</p>
                <p className="num text-[15px] font-medium text-ink">{rupiah(detail.customer.available_credit)}</p>
              </div>
              <div className="rounded-[10px] bg-paper-soft px-3 py-2.5">
                <p className="text-[10.5px] text-muted">Lewat tempo</p>
                <p className="num text-[15px] font-medium text-danger">{rupiah(detail.customer.overdue_amount)}</p>
              </div>
            </div>

            <p className="mt-5 mb-2 text-[12px] font-medium text-ink-soft">Riwayat kasbon</p>
            {detail.ledger.length === 0 ? (
              <p className="rounded-[10px] border border-dashed border-line px-4 py-6 text-center text-[12px] text-muted">
                Belum ada riwayat kasbon.
              </p>
            ) : (
              <div className="divide-y divide-line rounded-[10px] border border-line">
                {detail.ledger.map((entry) => {
                  const positive = Number(entry.amount) > 0;
                  return (
                    <div key={entry.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                      <div>
                        <p className="text-[12px] font-medium text-ink">
                          {entryLabel[entry.entry_type] ?? entry.entry_type}
                          {entry.receipt_no ? <span className="ml-1 font-normal text-muted">· {entry.receipt_no}</span> : null}
                        </p>
                        <p className="text-[10.5px] text-muted">
                          {formatDateTime(entry.created_at)}
                          {entry.due_date ? ` · tempo ${entry.due_date}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={cn("num text-[12.5px] font-medium", positive ? "text-danger" : "text-olive")}>
                          {positive ? "+" : ""}{rupiah(entry.amount)}
                        </p>
                        <p className="num text-[10px] text-faint">saldo {rupiah(entry.balance_after)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
