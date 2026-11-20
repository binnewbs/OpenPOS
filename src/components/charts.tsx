"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { rupiah, shortRupiah } from "@/server/format";

type TrendPoint = { date: string; total: number; count: number; profit: number };
type HourPoint = { hour: string; total: number; count: number };

function labelDate(date: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", timeZone: "Asia/Jakarta" }).format(
    new Date(`${date}T12:00:00+07:00`),
  );
}

function axisRupiah(value: number) {
  const n = Math.abs(value);
  if (n >= 1_000_000) return `${Math.round((value / 1_000_000) * 10) / 10}jt`;
  if (n >= 1_000) return `${Math.round(value / 1_000)}rb`;
  return String(value);
}

function TipBox({ active, payload, label }: { active?: boolean; payload?: { value?: number; name?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[10px] border border-line bg-paper px-3 py-2 shadow-[0_12px_30px_-18px_rgba(41,31,22,0.6)]">
      <p className="text-[11px] text-muted">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="num mt-0.5 text-[13px] font-medium text-ink">
          {entry.name === "total" ? rupiah(Number(entry.value)) : entry.value}
        </p>
      ))}
    </div>
  );
}

export function SalesTrend({ data }: { data: TrendPoint[] }) {
  const points = data.map((point) => ({ ...point, label: labelDate(point.date) }));
  return (
    <ResponsiveContainer width="100%" height={252}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ad6420" stopOpacity={0.26} />
            <stop offset="100%" stopColor="#ad6420" stopOpacity={0.015} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#e7dac8" strokeDasharray="3 5" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "#74614d", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval={1}
        />
        <YAxis
          tick={{ fill: "#74614d", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={58}
          tickFormatter={(value) => axisRupiah(Number(value))}
        />
        <Tooltip content={<TipBox />} cursor={{ stroke: "#d6c4ac", strokeDasharray: "3 4" }} />
        <Area
          type="monotone"
          dataKey="total"
          name="total"
          stroke="#ad6420"
          strokeWidth={2}
          fill="url(#salesFill)"
          activeDot={{ r: 4, fill: "#ad6420", stroke: "#fffaf2", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HourlySales({ data }: { data: HourPoint[] }) {
  const points = data.filter((point) => Number(point.hour.slice(0, 2)) >= 7);
  return (
    <ResponsiveContainer width="100%" height={252}>
      <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#e7dac8" strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey="hour" tick={{ fill: "#74614d", fontSize: 10 }} tickLine={false} axisLine={false} interval={1} />
        <YAxis
          tick={{ fill: "#74614d", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={58}
          tickFormatter={(value) => axisRupiah(Number(value))}
        />
        <Tooltip content={<TipBox />} cursor={{ fill: "#f5e4cc", opacity: 0.5 }} />
        <Bar dataKey="total" name="total" fill="#c08a4e" radius={[5, 5, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProfitBars({ data }: { data: { date: string; gross: number; profit: number }[] }) {
  const points = data.map((point) => ({ ...point, label: labelDate(point.date) }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#e7dac8" strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#74614d", fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fill: "#74614d", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={58}
          tickFormatter={(value) => axisRupiah(Number(value))}
        />
        <Tooltip content={<TipBox />} cursor={{ fill: "#f5e4cc", opacity: 0.5 }} />
        <Bar dataKey="gross" name="Penjualan" fill="#d8b489" radius={[5, 5, 0, 0]} maxBarSize={26} />
        <Bar dataKey="profit" name="Laba kotor" fill="#626d4b" radius={[5, 5, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}
