import { requireUser } from "@/server/auth";
import { getOpenShift, getStore } from "@/server/queries";
import { AppShell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const store = getStore(user.storeId);
  const shift = getOpenShift(user.storeId);

  return (
    <AppShell
      user={user}
      storeName={store?.name ?? "Warung"}
      shift={shift ? { id: shift.id, expected_cash_live: Number(shift.expected_cash_live), register_name: shift.register_name } : null}
    >
      {children}
    </AppShell>
  );
}
