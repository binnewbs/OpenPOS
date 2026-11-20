import { requireUser } from "@/server/auth";
import { getCategories, getAllProductUnits, getProductList, getUnits } from "@/server/queries";
import { plain } from "@/lib/plain";
import { ProductManager } from "./product-manager";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const user = await requireUser();
  const products = getProductList(user.storeId) as {
    id: string;
    name: string;
    sku: string | null;
    brand: string | null;
    retail_price: number;
    cost_price: number;
    min_stock_qty: number;
    track_stock: number;
    is_active: number;
    category_id: string | null;
    category: string | null;
    base_unit: string;
    base_unit_id: string;
    qty_on_hand: number;
    is_low_stock: number;
    avg_cost: number;
    stock_value: number;
  }[];
  const units = getUnits(user.storeId);
  const categories = getCategories(user.storeId);
  const unitRows = getAllProductUnits(user.storeId);

  const enriched = products.map((product) => ({
    ...product,
    units: unitRows
      .filter((row) => row.product_id === product.id)
      .map((row) => ({ unitId: row.unit_id, factor: Number(row.factor_to_base), price: Number(row.selling_price ?? 0) })),
  }));

  return (
    <ProductManager
      products={plain(enriched)}
      units={plain(units)}
      categories={plain(categories)}
      canEdit={user.permissions.includes("products.edit") || user.permissions.includes("products.create")}
    />
  );
}
