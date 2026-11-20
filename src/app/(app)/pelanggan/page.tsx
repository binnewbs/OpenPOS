import { requireUser } from "@/server/auth";
import { getCustomerDetails } from "@/server/queries";
import { plain } from "@/lib/plain";
import { CustomerManager } from "./customer-manager";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const user = await requireUser();
  const details = getCustomerDetails(user.storeId) as {
    customer: {
      id: string;
      name: string;
      phone: string | null;
      address: string | null;
      credit_limit: number;
      credit_balance: number;
      credit_term_days: number;
      available_credit: number;
      overdue_amount: number;
    };
    ledger: {
      id: string;
      entry_type: string;
      amount: number;
      balance_after: number;
      due_date: string | null;
      note: string | null;
      created_at: string;
      receipt_no: string | null;
    }[];
  }[];

  return (
    <CustomerManager
      details={plain(details)}
      canCreate={user.permissions.includes("customers.create")}
      canReceivePayment={user.permissions.includes("credit.payment")}
    />
  );
}
