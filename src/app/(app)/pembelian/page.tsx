import { requireUser } from "@/server/auth";
import { getAllProductUnits, getProductList, getPurchases, getSuppliers } from "@/server/queries";
import { plain } from "@/lib/plain";
import { PurchaseManager } from "./purchase-manager";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const user = await requireUser();
  const purchases = getPurchases(user.storeId) as {
    id: string;
    purchase_no: string;
    supplier_invoice_no: string | null;
    status: string;
    invoice_date: string;
    due_date: string | null;
    grand_total: number;
    paid_total: number;
    due_total: number;
    supplier_name: string;
    item_count: number;
    created_by_name: string | null;
  }[];
  const suppliers = getSuppliers(user.storeId) as {
    id: string;
    name: string;
    code: string | null;
    phone: string | null;
    payment_term_days: number;
    total_due: number;
  }[];
  const rawProducts = getProductList(user.storeId) as {
    id: string;
    name: string;
    sku: string | null;
    base_unit_id: string;
    base_unit: string;
    cost_price: number;
    retail_price: number;
  }[];
  const units = getAllProductUnits(user.storeId);
  const products = rawProducts.map((product) => ({
    ...product,
    units: units
      .filter((unit) => unit.product_id === product.id)
      .map((unit) => ({
        unitId: unit.unit_id,
        code: unit.code,
        factor: Number(unit.factor_to_base),
        isBase: Boolean(unit.is_base),
      })),
  }));

  return (
    <PurchaseManager
      purchases={plain(purchases)}
      suppliers={plain(suppliers)}
      products={plain(products)}
      canReceive={user.permissions.includes("inventory.receive")}
    />
  );
}
