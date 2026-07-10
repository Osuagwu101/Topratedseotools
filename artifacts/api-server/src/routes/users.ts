import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, ordersTable, productsTable, toolServersTable, toolEntitlementsTable } from "@workspace/db";
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
      oneClickAuthEnabled: productsTable.oneClickAuthEnabled,
      amountKobo: ordersTable.amountKobo,
      status: ordersTable.status,
      reference: ordersTable.reference,
      createdAt: ordersTable.createdAt,
      durationMonths: ordersTable.durationMonths,
      credUsername: toolServersTable.username,
      credPassword: toolServersTable.password,
      isAutoLogin: toolServersTable.isAutoLogin,
      entitlementStatus: toolEntitlementsTable.status,
      expiresAt: toolEntitlementsTable.expiresAt,
    })
    .from(ordersTable)
    .innerJoin(productsTable, eq(ordersTable.productId, productsTable.id))
    .leftJoin(toolEntitlementsTable, eq(toolEntitlementsTable.orderId, ordersTable.id))
    .leftJoin(toolServersTable, eq(toolServersTable.id, toolEntitlementsTable.serverId))
    .where(eq(ordersTable.clerkUserId, userId))
    .orderBy(ordersTable.createdAt);

  // Fallback for legacy/unassigned entitlements (serverId null) — use the
  // product's first configured server (auto-login preferred) so credentials
  // don't silently disappear for rows created before per-entitlement server
  // assignment existed.
  const allServers = await db.select().from(toolServersTable).orderBy(toolServersTable.id);
  const fallbackByProduct = new Map<number, typeof allServers[number]>();
  for (const s of allServers) {
    const existing = fallbackByProduct.get(s.productId);
    if (!existing || (!existing.isAutoLogin && s.isAutoLogin)) {
      fallbackByProduct.set(s.productId, s);
    }
  }

  res.json(
    rows.map((r) => {
      const now = new Date();
      const isEntitled =
        r.entitlementStatus === "active" && !!r.expiresAt && r.expiresAt > now;
      // An order is "active" for display purposes only while its entitlement is
      // both marked active and not yet expired.
      const isActive = r.status === "success" && isEntitled;

      const fallback = r.credUsername === null ? fallbackByProduct.get(r.productId) : undefined;
      const credUsername = r.credUsername ?? fallback?.username ?? null;
      const credPassword = r.credPassword ?? fallback?.password ?? null;
      const isAutoLogin = r.isAutoLogin ?? fallback?.isAutoLogin ?? null;
      // The one-click button is only usable when the tool is both an
      // auto-login server AND the admin has switched One-Click Auth on for
      // it — otherwise it would 403 if clicked.
      const usesOneClickAuth = !!isAutoLogin && !!r.oneClickAuthEnabled;

      return {
        ...r,
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
        status: r.status === "success" && !isEntitled && r.expiresAt ? "expired" : r.status,
        // Only expose credentials for active (non-expired) subscriptions.
        // If the tool isn't currently using one-click masking (either it was
        // never an auto-login tool, or the admin toggled One-Click Auth off),
        // fall back to showing raw credentials so the user can still log in.
        credUsername: isActive ? credUsername : null,
        credPassword: isActive && !usesOneClickAuth ? credPassword : null,
        isAutoLogin: isActive && usesOneClickAuth ? true : null,
      };
    })
  );
});

export default router;
