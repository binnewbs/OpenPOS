import { requireUser } from "@/server/auth";
import { getAccounting } from "@/server/queries";
import { businessDate, formatDate, rupiah } from "@/server/format";
import { Badge, Panel, PageHeader, SectionHeader, buttonClass, cn } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const today = businessDate();
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : today.slice(0, 7);
  const from = `${month}-01`;
  const to = month === today.slice(0, 7) ? today : `${month}-31`;
  const data = getAccounting(user.storeId, from, to, "2000-01-01");

  const totalDebit = data.trial.reduce((sum, row) => sum + Number(row.debit), 0);
  const totalCredit = data.trial.reduce((sum, row) => sum + Number(row.credit), 0);
  const balances = data.trial.map((row) => {
    const debit = Number(row.debit);
    const credit = Number(row.credit);
    const balance = row.normal_balance === "debit" ? debit - credit : credit - debit;
    return { ...row, debit, credit, balance };
  });

  return (
    <div>
      <PageHeader
        title="Akuntansi"
        meta={`Periode ${formatDate(from)} — ${formatDate(to)}`}
        subtitle="Setiap transaksi kasir otomatis menjadi jurnal berpasangan yang seimbang."
        action={
          <form action="/akuntansi" className="flex items-center gap-2">
            <input type="month" name="month" defaultValue={month} className="field h-9 w-[150px] text-[12px]" />
            <button className={buttonClass("secondary", "sm")} type="submit">
              Tampilkan
            </button>
          </form>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel>
          <p className="text-[11.5px] text-muted">Pendapatan</p>
          <p className="num mt-1.5 font-display text-[24px] text-ink">{rupiah(data.summary.revenue)}</p>
        </Panel>
        <Panel>
          <p className="text-[11.5px] text-muted">Harga pokok</p>
          <p className="num mt-1.5 font-display text-[24px] text-ink">{rupiah(data.summary.cogs)}</p>
        </Panel>
        <Panel>
          <p className="text-[11.5px] text-muted">Beban operasional</p>
          <p className="num mt-1.5 font-display text-[24px] text-ink">{rupiah(data.summary.expenses)}</p>
        </Panel>
        <Panel>
          <p className="text-[11.5px] text-muted">Laba bersih</p>
          <p className={cn("num mt-1.5 font-display text-[24px]", data.summary.netProfit < 0 ? "text-danger" : "text-olive")}>
            {rupiah(data.summary.netProfit)}
          </p>
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_1.35fr]">
        <Panel>
          <SectionHeader title="Laporan laba rugi" description="Ringkasan sederhana periode ini" />
          <div className="mt-4 space-y-2.5 text-[12.5px]">
            <StatementRow label="Pendapatan penjualan" value={data.summary.revenue} strong />
            <StatementRow label="Harga pokok penjualan" value={-data.summary.cogs} />
            <div className="border-t border-line pt-2.5">
              <StatementRow label="Laba kotor" value={data.summary.grossProfit} strong />
            </div>
            <StatementRow label="Beban operasional" value={-data.summary.expenses} />
            <div className="flex items-center justify-between border-t border-line pt-3">
              <span className="font-display text-[15px] text-ink">Laba bersih</span>
              <span className={cn("num font-display text-[19px]", data.summary.netProfit < 0 ? "text-danger" : "text-olive")}>
                {rupiah(data.summary.netProfit)}
              </span>
            </div>
          </div>
          <div className="mt-5 rounded-[12px] bg-paper-soft px-4 py-3">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-muted">Total debit</span>
              <span className="num text-ink">{rupiah(totalDebit)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11.5px]">
              <span className="text-muted">Total kredit</span>
              <span className="num text-ink">{rupiah(totalCredit)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[11.5px]">
              <span className="text-muted">Selisih</span>
              <span className={cn("num font-medium", totalDebit === totalCredit ? "text-olive" : "text-danger")}>
                {rupiah(totalDebit - totalCredit)}
              </span>
            </div>
          </div>
        </Panel>

        <Panel padded={false}>
          <div className="border-b border-line px-5 py-4">
            <SectionHeader title="Neraca saldo" description={`${balances.length} akun dengan mutasi`} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <thead>
                <tr className="border-b border-line bg-paper-soft/50 text-[11px] text-muted">
                  <th className="px-5 py-2.5 font-medium">Akun</th>
                  <th className="px-3 py-2.5 text-right font-medium">Debit</th>
                  <th className="px-3 py-2.5 text-right font-medium">Kredit</th>
                  <th className="px-5 py-2.5 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {balances.map((row) => (
                  <tr key={row.code} className="text-[12px]">
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-ink">{row.name}</p>
                      <p className="text-[10px] text-muted">{row.code} · {row.type}</p>
                    </td>
                    <td className="num px-3 py-2.5 text-right text-ink-soft">{row.debit ? rupiah(row.debit) : "—"}</td>
                    <td className="num px-3 py-2.5 text-right text-ink-soft">{row.credit ? rupiah(row.credit) : "—"}</td>
                    <td className="num px-5 py-2.5 text-right font-medium text-ink">{rupiah(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line bg-paper-soft/40 text-[12px] font-medium">
                  <td className="px-5 py-2.5 text-ink">Total</td>
                  <td className="num px-3 py-2.5 text-right text-ink">{rupiah(totalDebit)}</td>
                  <td className="num px-3 py-2.5 text-right text-ink">{rupiah(totalCredit)}</td>
                  <td className="px-5 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
      </div>

      <Panel className="mt-4" padded={false}>
        <div className="border-b border-line px-5 py-4">
          <SectionHeader
            title="Jurnal"
            description="Otomatis dari penjualan, pembelian, dan penyesuaian."
            action={
              <span className="flex items-center gap-1.5 text-[11.5px] text-olive">
                <span className="h-1.5 w-1.5 rounded-full bg-olive" /> Seimbang
              </span>
            }
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead>
              <tr className="border-b border-line bg-paper-soft/50 text-[11px] text-muted">
                <th className="px-5 py-2.5 font-medium">Nomor</th>
                <th className="px-3 py-2.5 font-medium">Tanggal</th>
                <th className="px-3 py-2.5 font-medium">Keterangan</th>
                <th className="px-3 py-2.5 font-medium">Sumber</th>
                <th className="px-5 py-2.5 text-right font-medium">Nilai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.journals.map((entry) => (
                <tr key={entry.id} className="text-[12px] transition-colors hover:bg-paper-soft/50">
                  <td className="num px-5 py-2.5 font-medium text-ink">{entry.entry_no}</td>
                  <td className="px-3 py-2.5 text-muted">{formatDate(entry.entry_date)}</td>
                  <td className="px-3 py-2.5 text-ink-soft">{entry.description}</td>
                  <td className="px-3 py-2.5">
                    <Badge tone="neutral">{entry.source_type.replaceAll("_", " ")}</Badge>
                  </td>
                  <td className="num px-5 py-2.5 text-right font-medium text-ink">{rupiah(entry.total)}</td>
                </tr>
              ))}
              {data.journals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-[12.5px] text-muted">
                    Belum ada jurnal pada periode ini.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function StatementRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-medium text-ink" : "text-ink-soft"}>{label}</span>
      <span className={cn("num", strong ? "font-medium text-ink" : "text-muted")}>{rupiah(value)}</span>
    </div>
  );
}
