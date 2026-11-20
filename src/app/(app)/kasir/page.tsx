import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { businessDate, formatLongDate } from "@/server/format";
import { getCustomers, getOpenShift, getStore } from "@/server/queries";
import { searchProducts } from "@/server/services/catalog";
import { plain } from "@/lib/plain";
import { CheckoutClient } from "./checkout-client";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const user = await requireUser();
  const store = getStore(user.storeId);
  const shift = getOpenShift(user.storeId);
  const products = searchProducts(getDb(), user.storeId, "", 500);
  const customers = getCustomers(user.storeId);
  const categories = Array.from(new Set(products.map((product) => product.category).filter(Boolean))) as string[];

  return (
    <CheckoutClient
      products={plain(products)}
      categories={plain(categories)}
      customers={plain(customers)}
      storeName={store.name}
      storeAddress={store.address}
      shiftOpen={Boolean(shift)}
      canDiscount={user.permissions.includes("sales.discount")}
      cashierName={user.name}
      dateLabel={formatLongDate(businessDate())}
    />
  );
}
