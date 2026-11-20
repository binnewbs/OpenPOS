import { requireUser } from "@/server/auth";
import { getSalesHistory } from "@/server/queries";
import { plain } from "@/lib/plain";
import { SalesHistory } from "./sales-history";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await requireUser();
  const sales = getSalesHistory(user.storeId, 40) as {
    id: string;
    receipt_no: string | null;
    business_date: string;
    completed_at: string | null;
    status: string;
    payment_status: string;
    grand_total: number;
    paid_total: number;
    due_total: number;
    change_total: number;
    cost_total: number;
    cashier: string;
    customer: string | null;
    item_count: number;
  }[];

  return <SalesHistory sales={plain(sales)} canVoid={user.permissions.includes("sales.void")} />;
}
