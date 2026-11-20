const TZ = "Asia/Jakarta";

export function nowIso(): string {
  return new Date().toISOString();
}

export function businessDate(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00+07:00`);
  d.setDate(d.getDate() + days);
  return businessDate(d);
}

export function periodKey(date: string): string {
  return date.slice(0, 7);
}

const rupiahFmt = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const numberFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

export function rupiah(value: number | null | undefined): string {
  return rupiahFmt.format(Math.round(Number(value ?? 0)));
}

export function shortRupiah(value: number): string {
  const n = Math.abs(value);
  if (n >= 1_000_000_000) return `Rp ${numberFmt.format(Math.round(value / 1_000_000_000 * 10) / 10)} M`;
  if (n >= 1_000_000) return `Rp ${numberFmt.format(Math.round(value / 1_000_000 * 10) / 10)} jt`;
  if (n >= 1_000) return `Rp ${numberFmt.format(Math.round(value / 1_000))} rb`;
  return rupiah(value);
}

export function qty(value: number | null | undefined): string {
  return numberFmt.format(Number(value ?? 0));
}

const dateFmt = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: TZ,
});

const longDateFmt = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TZ,
});

const timeFmt = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TZ,
});

export function formatDate(date: string | Date): string {
  const d =
    typeof date === "string"
      ? date.includes("T")
        ? new Date(date)
        : new Date(`${date}T12:00:00+07:00`)
      : date;
  return dateFmt.format(d);
}

export function formatLongDate(date: string | Date): string {
  const d =
    typeof date === "string"
      ? date.includes("T")
        ? new Date(date)
        : new Date(`${date}T12:00:00+07:00`)
      : date;
  return longDateFmt.format(d);
}

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}
