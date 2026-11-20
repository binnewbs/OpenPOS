"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Delete, Loader2 } from "lucide-react";
import { loginAction } from "@/server/actions/auth";
import { cn } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("owner");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    run(username, pin);
  };

  const run = (user: string, code: string) => {
    setError("");
    startTransition(async () => {
      const result = await loginAction({ username: user, pin: code });
      if (result.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(result.error);
        setPin("");
      }
    });
  };

  const press = (digit: string) => {
    setError("");
    setPin((value) => (value.length >= 8 ? value : value + digit));
  };

  return (
    <form onSubmit={submit} className="mt-8">
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">Nama pengguna</span>
          <input
            className="field"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            placeholder="owner"
            required
          />
        </label>

        <div>
          <span className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">PIN</span>
          <div className="flex h-12 items-center justify-center gap-3 rounded-[11px] border border-line-strong bg-paper px-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <span
                key={index}
                className={cn(
                  "h-2.5 w-2.5 rounded-full transition-colors",
                  index < pin.length ? "bg-accent" : "bg-line-strong/60",
                )}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => press(digit)}
              className="h-12 rounded-[11px] border border-line bg-paper text-[17px] font-medium text-ink transition-colors hover:border-accent/50 hover:bg-paper-soft active:bg-canvas-deep"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPin((value) => value.slice(0, -1))}
            className="flex h-12 items-center justify-center rounded-[11px] border border-line bg-paper text-muted transition-colors hover:bg-paper-soft"
            aria-label="Hapus angka"
          >
            <Delete size={18} />
          </button>
          <button
            type="button"
            onClick={() => press("0")}
            className="h-12 rounded-[11px] border border-line bg-paper text-[17px] font-medium text-ink transition-colors hover:border-accent/50 hover:bg-paper-soft active:bg-canvas-deep"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setPin("")}
            className="h-12 rounded-[11px] border border-line bg-paper text-[12px] text-muted transition-colors hover:bg-paper-soft"
          >
            Hapus
          </button>
        </div>
      </div>

      {error ? <p className="mt-3 rounded-[10px] bg-danger-soft px-3 py-2 text-[12.5px] text-danger">{error}</p> : null}

      <button
        type="submit"
        disabled={pending || pin.length < 4}
        className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-accent text-[15px] font-medium text-white shadow-[0_8px_20px_-12px_rgba(135,74,18,0.9)] transition-colors hover:bg-accent-deep disabled:opacity-45"
      >
        {pending ? <Loader2 size={17} className="animate-spin" /> : null}
        {pending ? "Memeriksa PIN..." : "Masuk"}
        {!pending ? <ArrowRight size={16} /> : null}
      </button>

      <div className="mt-7">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[11px] text-muted">Coba akun demo</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setUsername("owner");
              setPin("1234");
              run("owner", "1234");
            }}
            className="rounded-[11px] border border-line bg-paper px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-paper-soft disabled:opacity-50"
          >
            <p className="text-[12.5px] font-medium text-ink">Pemilik</p>
            <p className="text-[10.5px] text-muted">owner · PIN 1234</p>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setUsername("kasir");
              setPin("1111");
              run("kasir", "1111");
            }}
            className="rounded-[11px] border border-line bg-paper px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-paper-soft disabled:opacity-50"
          >
            <p className="text-[12.5px] font-medium text-ink">Kasir</p>
            <p className="text-[10.5px] text-muted">kasir · PIN 1111</p>
          </button>
        </div>
      </div>
    </form>
  );
}
