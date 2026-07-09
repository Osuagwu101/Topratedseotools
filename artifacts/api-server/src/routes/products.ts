import { Router, type IRouter } from "express";
import { db, productsTable } from "@workspace/db";
import {
  GetProductParams,
  GetProductResponse,
  ListProductsResponse,
} from "@workspace/api-zod";
import { and, eq } from "drizzle-orm";

const router: IRouter = Router();

// The public storefront only ever lists/serves visible, non-deleted tools.
// Hidden/deleted tools stay purchasable-blocked but keep existing subscriber
// access (enforced separately via entitlements, not product visibility).
router.get("/products", async (req, res): Promise<void> => {
  const products = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.isHidden, false), eq(productsTable.isDeleted, false)))
    .orderBy(productsTable.id);
  res.json(ListProductsResponse.parse(products));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id));

  if (!product || product.isDeleted || product.isHidden) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json(GetProductResponse.parse(product));
});

export default router;
