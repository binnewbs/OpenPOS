import { requireUser } from "@/server/auth";
import { getInventory, getStockMovements } from "@/server/queries";
import { plain } from "@/lib/plain";
import { StockManager } from "./stock-manager";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const user = await requireUser();
  const { items, totals } = getInventory(user.storeId);
  const movements = getStockMovements(user.storeId, 40) as {
    id: string;
    movement_type: string;
    qty_delta: number;
    qty_input: number | null;
    unit_cost: number;
    total_cost: number;
    reference_type: string | null;
    reason: string | null;
    business_date: string;
    created_at: string;
    product_name: string;
    unit_code: string | null;
    user_name: string | null;
  }[];

  return (
    <StockManager
      items={plain(items)}
      totals={plain(totals)}
      movements={plain(movements)}
      canAdjust={user.permissions.includes("inventory.adjust")}
    />
  );
}
