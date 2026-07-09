import { db, toolServersTable, toolEntitlementsTable } from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";

/**
 * Single source of truth for "does this user currently have access to this tool?"
 * Used by both the reverse proxy and the auto-login route so the two paths can't drift.
 */
export async function hasActiveEntitlement(
  userId: string,
  productId: number,
): Promise<boolean> {
  const [entitlement] = await db
    .select({ id: toolEntitlementsTable.id })
    .from(toolEntitlementsTable)
    .where(
      and(
        eq(toolEntitlementsTable.clerkUserId, userId),
        eq(toolEntitlementsTable.productId, productId),
        eq(toolEntitlementsTable.status, "active"),
        gt(toolEntitlementsTable.expiresAt, new Date()),
      ),
    );
  return !!entitlement;
}

/**
 * Picks a default server to assign a new entitlement to when the order/grant
 * flow doesn't specify one explicitly. Prefers the product's auto-login
 * server (lowest id) since those are proxy-backed; otherwise falls back to
 * the product's first configured server of any kind. Returns null if the
 * product has no servers configured yet (e.g. still being set up by admin).
 */
export async function pickDefaultServerForProduct(productId: number): Promise<number | null> {
  const [autoLogin] = await db
    .select({ id: toolServersTable.id })
    .from(toolServersTable)
    .where(and(eq(toolServersTable.productId, productId), eq(toolServersTable.isAutoLogin, true)))
    .orderBy(toolServersTable.id);

  if (autoLogin) return autoLogin.id;

  const [any] = await db
    .select({ id: toolServersTable.id })
    .from(toolServersTable)
    .where(eq(toolServersTable.productId, productId))
    .orderBy(toolServersTable.id);

  return any?.id ?? null;
}

/**
 * Resolves which tool_servers row a given user's active entitlement for this
 * product should use. Prefers the server explicitly assigned to their
 * entitlement; falls back to the product's first auto-login server for
 * legacy entitlements created before per-entitlement server assignment
 * existed. Returns null if the user has no active entitlement or no server
 * is configured at all.
 */
export async function resolveServerForUser(
  userId: string,
  productId: number,
): Promise<typeof toolServersTable.$inferSelect | null> {
  const [entitlement] = await db
    .select({ serverId: toolEntitlementsTable.serverId })
    .from(toolEntitlementsTable)
    .where(
      and(
        eq(toolEntitlementsTable.clerkUserId, userId),
        eq(toolEntitlementsTable.productId, productId),
        eq(toolEntitlementsTable.status, "active"),
        gt(toolEntitlementsTable.expiresAt, new Date()),
      ),
    );

  if (!entitlement) return null;

  if (entitlement.serverId) {
    const [server] = await db
      .select()
      .from(toolServersTable)
      .where(eq(toolServersTable.id, entitlement.serverId));
    if (server) return server;
  }

  // Legacy fallback — no server assigned on the entitlement, use the first
  // configured auto-login server for this product.
  const [fallback] = await db
    .select()
    .from(toolServersTable)
    .where(and(eq(toolServersTable.productId, productId), eq(toolServersTable.isAutoLogin, true)))
    .orderBy(toolServersTable.id);

  return fallback ?? null;
}
