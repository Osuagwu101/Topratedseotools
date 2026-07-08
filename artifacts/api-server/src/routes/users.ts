import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, ordersTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/users/me/orders", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth?.userId;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rows = await db
    .select({
      id: ordersTable.id,
      productId: ordersTable.productId,
      productName: productsTable.name,
      billingPeriod: productsTable.billingPeriod,
      amountKobo: ordersTable.amountKobo,
      status: ordersTable.status,
      reference: ordersTable.reference,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .innerJoin(productsTable, eq(ordersTable.productId, productsTable.id))
    .where(eq(ordersTable.clerkUserId, userId))
    .orderBy(ordersTable.createdAt);

  res.json(
    rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
  );
});

export default router;
