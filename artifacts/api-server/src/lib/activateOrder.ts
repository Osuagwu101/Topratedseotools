import { db, ordersTable, toolEntitlementsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { pickDefaultServerForProduct } from "./toolAccess";

export type ActivationResult =
  | { outcome: "activated"; orderId: number; expiresAt: Date }
  | { outcome: "already_active"; orderId: number; expiresAt: Date }
  | { outcome: "underpaid"; orderId: number }
  | { outcome: "failed"; orderId: number | null };

function computeExpiry(durationMonths: number, from: Date): Date {
  const expires = new Date(from);
  expires.setMonth(expires.getMonth() + durationMonths);
  return expires;
}

/**
 * Shared activation logic used by both the Paystack webhook and the client-triggered
 * verify route. Idempotent: safe to call multiple times for the same reference.
 */
export async function activateOrderByReference(
  reference: string,
  paidAmountKobo: number,
  serverId?: number | null,
): Promise<ActivationResult> {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.reference, reference));

  if (!order) {
    logger.error({ reference }, "Activation attempted for unknown order reference");
    return { outcome: "failed", orderId: null };
  }

  // Already processed — no-op (idempotent replay from Paystack webhook retries).
  const [existingEntitlement] = await db
    .select()
    .from(toolEntitlementsTable)
    .where(eq(toolEntitlementsTable.orderId, order.id));

  if (existingEntitlement) {
    return {
      outcome: "already_active",
      orderId: order.id,
      expiresAt: existingEntitlement.expiresAt,
    };
  }

  if (paidAmountKobo < order.amountKobo) {
    logger.error(
      { reference, paidAmountKobo, expectedAmount: order.amountKobo },
      "Activation refused — paid amount is less than order amount",
    );
    await db.update(ordersTable).set({ status: "failed" }).where(eq(ordersTable.id, order.id));
    return { outcome: "underpaid", orderId: order.id };
  }

  const expiresAt = computeExpiry(order.durationMonths, new Date());

  await db.transaction(async (tx) => {
    await tx.update(ordersTable).set({ status: "success" }).where(eq(ordersTable.id, order.id));

    if (order.clerkUserId) {
      const assignedServerId =
        serverId !== undefined && serverId !== null
          ? serverId
          : await pickDefaultServerForProduct(order.productId);

      await tx
        .insert(toolEntitlementsTable)
        .values({
          clerkUserId: order.clerkUserId,
          productId: order.productId,
          serverId: assignedServerId,
          orderId: order.id,
          reference: order.reference,
          status: "active",
          expiresAt,
        })
        .onConflictDoNothing({ target: toolEntitlementsTable.orderId });
    }
  });

  return { outcome: "activated", orderId: order.id, expiresAt };
}

/**
 * Marks an order as failed (e.g. Paystack reports a failed/abandoned/reversed event).
 * Also revokes any existing entitlement tied to this order/reference so a later
 * reversal or dispute on a previously-activated order immediately removes access.
 */
export async function markOrderFailed(reference: string): Promise<void> {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.reference, reference));

  if (!order) {
    logger.error({ reference }, "markOrderFailed called for unknown order reference");
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(ordersTable).set({ status: "failed" }).where(eq(ordersTable.id, order.id));

    await tx
      .update(toolEntitlementsTable)
      .set({ status: "revoked" })
      .where(eq(toolEntitlementsTable.orderId, order.id));
  });
}
