import { requireUser } from "@/server/auth";
import {
  getExpenseCategories,
  getExpenses,
  getOpenShift,
  getShiftCashMovements,
  getShiftHistory,
  getShiftSalesSummary,
} from "@/server/queries";
import { plain } from "@/lib/plain";
import { ShiftManager } from "./shift-manager";

export const dynamic = "force-dynamic";

export default async function ShiftPage() {
  const user = await requireUser();
  const shift = getOpenShift(user.storeId);
  const movements = shift ? getShiftCashMovements(shift.id) : [];
  const salesSummary = shift ? getShiftSalesSummary(shift.id) : null;
  const history = getShiftHistory(user.storeId, 10) as {
    id: string;
    register_name: string;
    opened_at: string;
    closed_at: string | null;
    opening_cash: number;
    expected_cash: number | null;
    counted_cash: number | null;
    difference: number | null;
    status: string;
    cashier_name: string;
  }[];
  const expenses = getExpenses(user.storeId, 12) as {
    id: string;
    amount: number;
    description: string;
    paid_from: string;
    business_date: string;
    created_at: string;
    category: string;
    created_by_name: string | null;
  }[];

  return (
    <ShiftManager
      shift={
        shift
          ? {
              id: shift.id,
              register_name: shift.register_name,
              opened_at: shift.opened_at,
              opening_cash: Number(shift.opening_cash),
              expected_cash: Number(shift.expected_cash_live),
              cashier_name: shift.cashier_name,
            }
          : null
      }
      movements={plain(movements)}
      salesSummary={plain(salesSummary)}
      history={plain(history)}
      expenses={plain(expenses)}
      categories={plain(getExpenseCategories(user.storeId))}
      canOpen={user.permissions.includes("shifts.open")}
      canClose={user.permissions.includes("shifts.close")}
      canExpense={user.permissions.includes("expenses.create")}
    />
  );
}
