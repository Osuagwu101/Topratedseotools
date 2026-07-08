import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, ordersTable, productsTable, toolCredentialsTable } from "@workspace/db";
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
      credUsername: toolCredentialsTable.username,
      credPassword: toolCredentialsTable.password,
      isAutoLogin: toolCredentialsTable.isAutoLogin,
    })
    .from(ordersTable)
    .innerJoin(productsTable, eq(ordersTable.productId, productsTable.id))
    .leftJoin(toolCredentialsTable, eq(toolCredentialsTable.productId, ordersTable.productId))
    .where(eq(ordersTable.clerkUserId, userId))
    .orderBy(ordersTable.createdAt);

  res.json(
    rows.map((r) => {
      const isActive = r.status === "success";
      return {
        ...r,
        createdAt: r.createdAt.toISOString(),
        // Only expose credentials for active subscriptions.
        // For auto-login tools, omit raw password (auto-login endpoint handles it).
        credUsername: isActive ? r.credUsername : null,
        credPassword: isActive && !r.isAutoLogin ? r.credPassword : null,
        isAutoLogin: isActive ? (r.isAutoLogin ?? null) : null,
      };
    })
  );
});

export default router;
