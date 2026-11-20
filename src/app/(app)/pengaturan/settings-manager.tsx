"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cloud, Database, Download, KeyRound, Loader2, ShieldCheck, Store } from "lucide-react";
import { Badge, Button, Field, PageHeader, Panel, SectionHeader, buttonClass, cn } from "@/components/ui";
import { Modal } from "@/components/modal";
import { resetPinAction, updateStoreAction } from "@/server/actions/settings";
import { formatDateTime, rupiah } from "@/server/format";

type StoreData = {
  id: string;
  name: string;
  legal_name: string | null;
  address: string | null;
  phone: string | null;
  tax_enabled: number;
  tax_rate: number;
  rounding_increment: number;
  receipt_footer: string | null;
};

type UserRow = {
  id: string;
  name: string;
  username: string;
  is_active: number;
  last_login_at: string | null;
  role_name: string;
  role_slug: string;
};

type Activity = {
  id: string;
  action: string;
  entity_type: string;
  reason: string | null;
  created_at: string;
  user_name: string | null;
};

const actionLabel: Record<string, string> = {
  "sale.complete": "Penjualan selesai",
  "sale.void": "Penjualan dibatalkan",
  "product.create": "Produk ditambahkan",
  "product.update": "Produk diubah",
  "stock.adjust": "Stok disesuaikan",
  "purchase.post": "Pembelian diterima",
  "credit.payment": "Pembayaran kasbon",
  "shift.open": "Shift dibuka",
  "shift.close": "Shift ditutup",
  "settings.update": "Pengaturan diubah",
  "user.pin_reset": "PIN pengguna direset",
  "expense.create": "Pengeluaran dicatat",
};

export function SettingsManager({
  store,
  users,
  activity,
  canManageSettings,
  canManageUsers,
  canBackup,
  currentUserId,
}: {
  store: StoreData;
  users: UserRow[];
  activity: Activity[];
  canManageSettings: boolean;
  canManageUsers: boolean;
  canBackup: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: store.name,
    legalName: store.legal_name ?? "",
    address: store.address ?? "",
    phone: store.phone ?? "",
    taxEnabled: Boolean(store.tax_enabled),
    taxRate: Number(store.tax_rate),
    roundingIncrement: Number(store.rounding_increment),
    receiptFooter: store.receipt_footer ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [newPin, setNewPin] = useState("");

  async function saveStore() {
    setBusy(true);
    setError("");
    setMessage("");
    const result = await updateStoreAction(form);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage("Pengaturan tersimpan.");
    router.refresh();
  }

  async function resetPin() {
    if (!resetUser) return;
    setBusy(true);
    setError("");
    const result = await resetPinAction({ userId: resetUser.id, pin: newPin });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setResetUser(null);
    setNewPin("");
    setMessage(`PIN ${resetUser.name} diperbarui.`);
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Pengaturan"
        subtitle="Identitas toko, akses pengguna, dan salinan data. Perubahan berlaku langsung."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Panel>
          <SectionHeader
            title="Identitas toko"
            description="Tampil di nota dan laporan."
            action={<Store size={17} className="text-faint" />}
          />
          <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
            <Field label="Nama toko" className="sm:col-span-2">
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="field" />
            </Field>
            <Field label="Nama badan usaha">
              <input value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} className="field" />
            </Field>
            <Field label="Telepon">
              <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="field" />
            </Field>
            <Field label="Alamat" className="sm:col-span-2">
              <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="field" />
            </Field>
            <Field label="Pembulatan tunai" hint="Pembulatan ke atas saat pembayaran tunai.">
              <input
                type="number"
                min={0}
                step={50}
                value={form.roundingIncrement}
                onChange={(event) => setForm({ ...form, roundingIncrement: Number(event.target.value) })}
                className="field num"
              />
            </Field>
            <Field label="PPN" hint="Nonaktif secara bawaan untuk warung non-PKP.">
              <label className="flex h-[38px] items-center gap-2 rounded-[11px] border border-line-strong bg-paper px-3 text-[12.5px] text-ink-soft">
                <input
                  type="checkbox"
                  checked={form.taxEnabled}
                  onChange={(event) => setForm({ ...form, taxEnabled: event.target.checked })}
                  className="h-4 w-4 accent-[#ad6420]"
                />
                Aktifkan PPN
              </label>
            </Field>
            {form.taxEnabled ? (
              <Field label="Tarif PPN (%)">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.taxRate}
                  onChange={(event) => setForm({ ...form, taxRate: Number(event.target.value) })}
                  className="field num"
                />
              </Field>
            ) : null}
            <Field label="Pesan di nota" className="sm:col-span-2">
              <textarea
                value={form.receiptFooter}
                onChange={(event) => setForm({ ...form, receiptFooter: event.target.value })}
                className="field min-h-[72px] resize-none"
              />
            </Field>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-[12px]">
              {message ? <span className="text-olive">{message}</span> : null}
              {error ? <span className="text-danger">{error}</span> : null}
            </div>
            <Button onClick={saveStore} disabled={busy || !canManageSettings}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : null} Simpan pengaturan
            </Button>
          </div>
        </Panel>

        <Panel className="flex flex-col">
          <SectionHeader title="Pratinjau nota" description="58 mm" action={<Badge tone="accent">Contoh</Badge>} />
          <div className="nota-edge mx-auto mt-5 w-full max-w-[270px] rounded-[6px] border border-line bg-paper px-5 pb-8 pt-5">
            <p className="text-center font-display text-[17px] text-ink">{form.name || "Nama toko"}</p>
            <p className="mt-0.5 text-center text-[9.5px] leading-relaxed text-muted">{form.address || "Alamat toko"}</p>
            <p className="text-center text-[9.5px] text-muted">{form.phone || "Telepon"}</p>
            <div className="my-3 border-t border-dashed border-line-strong" />
            {[
              ["Indomie Goreng", "2", "7.000"],
              ["Teh Botol Sosro", "1", "4.500"],
              ["Sampoerna Mild", "1", "33.500"],
            ].map(([name, qty, price]) => (
              <div key={name} className="flex items-baseline justify-between gap-2 py-1 text-[10px]">
                <span className="text-ink-soft">{name}</span>
                <span className="num text-muted">×{qty}</span>
                <span className="num text-ink">{price}</span>
              </div>
            ))}
            <div className="my-3 border-t border-dashed border-line-strong" />
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-ink-soft">Total</span>
              <span className="num font-display text-[16px] text-ink">Rp 45.000</span>
            </div>
            <p className="mt-1 flex items-center justify-between text-[9px] text-muted">
              <span>Tunai</span>
              <span className="num">Rp 50.000</span>
            </p>
            <p className="flex items-center justify-between text-[9px] text-muted">
              <span>Kembali</span>
              <span className="num">Rp 5.000</span>
            </p>
            <p className="mt-4 text-center text-[9px] leading-relaxed text-muted">
              {form.receiptFooter || "Terima kasih sudah berbelanja"}
            </p>
          </div>
          <p className="mt-4 text-center text-[11px] text-faint">
            Pembulatan {rupiah(form.roundingIncrement)} · {form.taxEnabled ? `PPN ${form.taxRate}%` : "tanpa PPN"}
          </p>
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Panel padded={false}>
          <div className="border-b border-line px-5 py-4">
            <SectionHeader title="Pengguna & akses" description="PIN dipakai untuk masuk dan menyetujui tindakan sensitif." />
          </div>
          <div className="divide-y divide-line">
            {users.map((user) => (
              <div key={user.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-canvas-deep text-[11px] font-semibold text-ink-soft">
                    {user.name.split(" ").slice(0, 2).map((part) => part[0]).join("")}
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-ink">
                      {user.name}
                      {user.id === currentUserId ? <span className="ml-1.5 text-[10px] font-normal text-muted">(kamu)</span> : null}
                    </p>
                    <p className="text-[11px] text-muted">
                      @{user.username} · {user.role_name}
                      {user.last_login_at ? ` · masuk ${formatDateTime(user.last_login_at)}` : ""}
                    </p>
                  </div>
                </div>
                {canManageUsers ? (
                  <Button variant="secondary" size="sm" onClick={() => { setResetUser(user); setNewPin(""); setError(""); }}>
                    <KeyRound size={13} /> Reset PIN
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-olive-soft text-olive">
                  <Database size={18} />
                </div>
                <div>
                  <p className="text-[13.5px] font-medium text-ink">Salinan lokal</p>
                  <p className="text-[11.5px] text-muted">Data tersimpan di perangkat ini.</p>
                </div>
              </div>
              <Badge tone="olive">Aktif</Badge>
            </div>
            <div className="mt-4 rounded-[10px] bg-paper-soft px-3.5 py-2.5 text-[11.5px] text-ink-soft">
              SQLite · WAL · {users.length} pengguna · jurnal otomatis
            </div>
            {canBackup ? (
              <a href="/api/backup" className={buttonClass("secondary", "sm", "mt-3 w-full")}>
                <Download size={14} /> Unduh backup
              </a>
            ) : null}
          </Panel>

          <Panel>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-accent-soft text-accent-deep">
                  <Cloud size={18} />
                </div>
                <div>
                  <p className="text-[13.5px] font-medium text-ink">Sinkronisasi cloud</p>
                  <p className="text-[11.5px] text-muted">Opsional, tidak menghalangi kasir.</p>
                </div>
              </div>
              <Badge tone="neutral">Belum aktif</Badge>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
              Sambungkan Supabase untuk cadangan dan multi-perangkat. Toko tetap bisa berjualan saat offline.
            </p>
            <div className="mt-3 space-y-1.5 text-[11.5px] text-muted">
              <p className="flex items-center gap-2"><ShieldCheck size={13} className="text-olive" /> Hanya anonim key yang disimpan</p>
              <p className="flex items-center gap-2"><ShieldCheck size={13} className="text-olive" /> RLS per toko</p>
              <p className="flex items-center gap-2"><ShieldCheck size={13} className="text-olive" /> Unggah awal yang bisa dilanjutkan</p>
            </div>
            <div className="mt-3 rounded-[10px] border border-dashed border-line-strong px-3 py-2 text-center text-[11px] text-muted">
              Wizard cloud tersedia pada rilis berikutnya
            </div>
          </Panel>
        </div>
      </div>

      <Panel className="mt-4" padded={false}>
        <div className="border-b border-line px-5 py-4">
          <SectionHeader title="Log aktivitas" description="20 tindakan terakhir yang tercatat" />
        </div>
        <div className="divide-y divide-line">
          {activity.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <div className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
                <p className="text-[12px] text-ink-soft">
                  {actionLabel[item.action] ?? item.action}
                  <span className="text-muted"> · {item.entity_type}</span>
                  {item.reason ? <span className="text-muted"> · {item.reason}</span> : null}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10.5px] text-muted">{item.user_name ?? "Sistem"}</p>
                <p className="text-[10px] text-faint">{formatDateTime(item.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <p className="mt-6 text-center text-[11px] text-faint">
        OpenPOS v0.1 · offline-first · dibuat untuk warung Indonesia
      </p>

      <Modal
        open={Boolean(resetUser)}
        onClose={() => setResetUser(null)}
        title="Reset PIN"
        description={resetUser ? `Buat PIN baru untuk ${resetUser.name}.` : undefined}
        width="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setResetUser(null)}>Batal</Button>
            <Button onClick={resetPin} disabled={busy || !/^\d{4,8}$/.test(newPin)}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : null} Simpan PIN
            </Button>
          </div>
        }
      >
        <Field label="PIN baru" hint="4–8 angka. Beritahu pengguna untuk segera menggantinya.">
          <input
            value={newPin}
            onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
            className="field num text-[18px] tracking-[0.3em]"
            inputMode="numeric"
            autoFocus
          />
        </Field>
        {error ? <p className="mt-3 rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p> : null}
      </Modal>
    </div>
  );
}
