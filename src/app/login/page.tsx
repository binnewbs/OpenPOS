import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

const demoLines = [
  ["Indomie Goreng", "2", "7.000"],
  ["Teh Botol Sosro", "1", "4.500"],
  ["Rokok Sampoerna Mild", "1", "33.500"],
];

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-rail p-14 lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #f2e8d8 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        />
        <div
          className="pointer-events-none absolute -right-40 top-1/4 h-[420px] w-[420px] rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, #ad6420, transparent 70%)" }}
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#d09a45] to-[#a75f1c] font-display text-[21px] leading-none text-[#2b1b0b]">
              O
            </div>
            <span className="font-display text-[20px] tracking-tight text-rail-ink">OpenPOS</span>
          </div>

          <h1 className="mt-16 max-w-[15ch] font-display text-[52px] leading-[1.02] tracking-[-0.02em] text-rail-ink">
            Kasir yang tenang, buku yang rapi.
          </h1>
          <p className="mt-5 max-w-[38ch] text-[15px] leading-relaxed text-[#c9b8a2]">
            Jualan tetap jalan tanpa internet. Stok, kasbon, dan laporan dihitung rapi di belakang layar.
          </p>
        </div>

        <div className="relative mt-16 flex items-end justify-between gap-8">
          <div className="max-w-[24ch]">
            <p className="font-display text-[15px] text-[#e2b467]">Warung Berkah</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#a69078]">
              Semua data tersimpan di perangkat ini. Cloud opsional, bukan keharusan.
            </p>
          </div>

          <div className="nota-edge w-[230px] shrink-0 rotate-[-2.5deg] rounded-[6px] bg-paper px-5 pb-7 pt-5 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.6)]">
            <p className="text-center font-display text-[15px] text-ink">Nota Penjualan</p>
            <p className="mt-0.5 text-center text-[10px] text-muted">21 Nov 2026 · 14:32</p>
            <div className="my-3 border-t border-dashed border-line-strong" />
            {demoLines.map(([name, qty, price]) => (
              <div key={name} className="flex items-baseline justify-between gap-2 py-1">
                <span className="text-[11px] text-ink-soft">{name}</span>
                <span className="num text-[11px] text-muted">×{qty}</span>
                <span className="num text-[11px] text-ink">{price}</span>
              </div>
            ))}
            <div className="my-3 border-t border-dashed border-line-strong" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-ink-soft">Total</span>
              <span className="num font-display text-[17px] text-ink">Rp 45.000</span>
            </div>
            <p className="mt-3 text-center text-[9.5px] text-muted">Terima kasih sudah berbelanja</p>
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-9 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#d09a45] to-[#a75f1c] font-display text-[21px] leading-none text-[#2b1b0b]">
                O
              </div>
              <span className="font-display text-[20px]">OpenPOS</span>
            </div>
          </div>

          <p className="text-[13px] text-muted">Selamat datang kembali</p>
          <h2 className="mt-1.5 font-display text-[32px] leading-tight text-ink">Masuk ke warung</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
            Gunakan PIN kasir untuk membuka laci dan mulai melayani pembeli.
          </p>

          <LoginForm />
        </div>
      </section>
    </main>
  );
}
