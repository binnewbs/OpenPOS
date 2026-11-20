"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  ChartNoAxesColumnIncreasing,
  Clock3,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ScanLine,
  Scale,
  Settings,
  Truck,
  Users,
  X,
} from "lucide-react";
import { logoutAction } from "@/server/actions/auth";
import type { SessionUser } from "@/lib/types";
import { cn } from "./ui";

const NAV = [
  {
    label: "Utama",
    items: [
      { href: "/", label: "Beranda", icon: LayoutDashboard, permission: null },
      { href: "/kasir", label: "Kasir", icon: ScanLine, permission: "sales.create" },
    ],
  },
  {
    label: "Katalog",
    items: [
      { href: "/produk", label: "Produk", icon: Package, permission: "products.view" },
      { href: "/stok", label: "Persediaan", icon: Boxes, permission: "inventory.view" },
    ],
  },
  {
    label: "Hubungan",
    items: [
      { href: "/pelanggan", label: "Pelanggan", icon: Users, permission: "customers.view" },
      { href: "/pembelian", label: "Pembelian", icon: Truck, permission: "purchases.view" },
    ],
  },
  {
    label: "Analitik",
    items: [
      { href: "/laporan", label: "Laporan", icon: ChartNoAxesColumnIncreasing, permission: "reports.sales" },
      { href: "/akuntansi", label: "Akuntansi", icon: Scale, permission: "accounting.view" },
    ],
  },
  {
    label: "Sistem",
    items: [
      { href: "/riwayat", label: "Riwayat", icon: History, permission: "sales.create" },
      { href: "/shift", label: "Shift & Kas", icon: Clock3, permission: "shifts.open" },
      { href: "/pengaturan", label: "Pengaturan", icon: Settings, permission: null },
    ],
  },
];

export function AppShell({
  user,
  storeName,
  shift,
  children,
}: {
  user: SessionUser;
  storeName: string;
  shift: { id: string; expected_cash_live: number; register_name: string } | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || user.permissions.includes(item.permission)),
  })).filter((group) => group.items.length > 0);

  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-6 pt-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#d09a45] to-[#a75f1c] font-display text-[21px] leading-none text-[#2b1b0b] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
          O
        </div>
        <div className="min-w-0">
          <p className="font-display text-[19px] leading-tight text-rail-ink">OpenPOS</p>
          <p className="truncate text-[11.5px] text-[#b9a78f]">{storeName}</p>
        </div>
      </div>

      <nav className="scroll-thin flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="mb-1.5 px-3 text-[10.5px] font-medium text-[#8d7b66]">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] transition-colors",
                      active
                        ? "bg-white/[0.07] font-medium text-rail-ink"
                        : "text-[#c9b8a2] hover:bg-white/[0.04] hover:text-rail-ink",
                    )}
                  >
                    {active ? (
                      <span className="absolute left-0 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-full bg-[#d09a45]" />
                    ) : null}
                    <Icon size={17} strokeWidth={1.7} className={active ? "text-[#e2b467]" : "text-[#9d8b75]"} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.07] p-3.5">
        <Link
          href="/shift"
          onClick={() => setOpen(false)}
          className="block rounded-[12px] border border-white/[0.07] bg-white/[0.035] px-3.5 py-3 transition-colors hover:bg-white/[0.06]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#a69078]">Shift berjalan</span>
            {shift ? (
              <span className="flex items-center gap-1.5 text-[11px] text-[#c7d2a5]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#a8bb79]" /> Buka
              </span>
            ) : (
              <span className="text-[11px] text-[#c58a6e]">Tutup</span>
            )}
          </div>
          <p className="num mt-1 font-display text-[17px] text-rail-ink">
            {shift
              ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(shift.expected_cash_live)
              : "Belum ada shift"}
          </p>
          <p className="mt-0.5 text-[10.5px] text-[#a69078]">{shift ? "Kas laci diperkirakan" : "Buka shift untuk mulai berjualan"}</p>
        </Link>

        <div className="mt-3 flex items-center gap-2.5 px-1.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-[12px] font-semibold text-rail-ink">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium text-rail-ink">{user.name}</p>
            <p className="text-[10.5px] text-[#a69078]">{user.roleName}</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#a69078] transition-colors hover:bg-white/[0.06] hover:text-rail-ink"
              aria-label="Keluar"
              title="Keluar"
            >
              <LogOut size={15} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] bg-rail lg:block">{nav}</aside>

      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas/90 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-gradient-to-br from-[#d09a45] to-[#a75f1c] font-display text-[17px] leading-none text-[#2b1b0b]">
            O
          </div>
          <span className="font-display text-[17px]">OpenPOS</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-line bg-paper text-ink-soft"
          aria-label="Buka menu"
        >
          <Menu size={18} />
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-[#1d150e]/50" aria-label="Tutup menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[284px] bg-rail shadow-2xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-[#a69078]"
              aria-label="Tutup menu"
            >
              <X size={18} />
            </button>
            {nav}
          </div>
        </div>
      ) : null}

      <main className="lg:pl-[272px]">
        <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-9 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
