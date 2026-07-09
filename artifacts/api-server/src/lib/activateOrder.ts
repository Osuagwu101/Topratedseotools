import { db, ordersTable, toolEntitlementsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

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
      await tx
        .insert(toolEntitlementsTable)
        .values({
          clerkUserId: order.clerkUserId,
          productId: order.productId,
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

/** Marks an order as failed (e.g. Paystack reports a failed/abandoned/reversed event). */
export async function markOrderFailed(reference: string): Promise<void> {
  await db
    .update(ordersTable)
    .set({ status: "failed" })
    .where(eq(ordersTable.reference, reference));
}
