import { db, ordersTable, toolEntitlementsTable, reviewPromptsTable } from "@workspace/db";
import { eq, ne, and } from "drizzle-orm";
import { logger } from "./logger";
import { pickDefaultServerForProduct } from "./toolAccess";
import { recordCouponRedemption, releaseCouponUsage } from "./coupons";
import { processQualifyingPurchase } from "./referrals";
import { adjustCredit } from "./credits";

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
  // The whole claim-and-activate step runs under a row lock on the order so
  // that two near-simultaneous callers (e.g. the Paystack webhook and the
  // client-triggered verify route) can never both perform the coupon
  // redemption / entitlement insert / referral side effects for the same
  // order. The loser blocks on the SELECT ... FOR UPDATE until the winner's
  // transaction commits, then observes the already-committed result.
  const claim = await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.reference, reference))
      .for("update");

    if (!order) {
      return { kind: "not_found" as const };
    }

    // Already processed — no-op (idempotent replay from Paystack webhook retries,
    // or this call lost the race to another activation that already committed).
    const [existingEntitlement] = await tx
      .select()
      .from(toolEntitlementsTable)
      .where(eq(toolEntitlementsTable.orderId, order.id));

    if (existingEntitlement) {
      return { kind: "already_active" as const, orderId: order.id, expiresAt: existingEntitlement.expiresAt };
    }

    if (order.status === "failed") {
      return { kind: "failed" as const, orderId: order.id };
    }

    if (paidAmountKobo < order.amountKobo) {
      logger.error(
        { reference, paidAmountKobo, expectedAmount: order.amountKobo },
        "Activation refused — paid amount is less than order amount",
      );
      await tx.update(ordersTable).set({ status: "failed" }).where(eq(ordersTable.id, order.id));

      // Release the coupon usage slot reserved at order-creation time (see
      // reserveCouponUsage in coupons.ts) since the purchase never completed.
      if (order.couponId) {
        await releaseCouponUsage(order.couponId, tx);
      }

      // Refund any store credit debited at order-creation time, since the
      // purchase never actually completed. Safe to do inline here (rather
      // than relying on markOrderFailed) because this whole branch already
      // runs under the row lock acquired above — no concurrent caller can
      // observe or re-trigger this transition for the same order.
      if (order.creditAppliedKobo > 0 && order.clerkUserId) {
        try {
          await adjustCredit(
            {
              clerkUserId: order.clerkUserId,
              amountKobo: order.creditAppliedKobo,
              reason: "order_failed_refund",
              orderId: order.id,
            },
            tx,
          );
        } catch (err) {
          logger.error({ err, orderId: order.id }, "Failed to refund store credit for underpaid order");
        }
      }

      return { kind: "underpaid" as const, orderId: order.id };
    }

    const expiresAt = computeExpiry(order.durationMonths, new Date());

    await tx.update(ordersTable).set({ status: "success" }).where(eq(ordersTable.id, order.id));

    if (order.couponId && order.discountKobo > 0) {
      try {
        await recordCouponRedemption(
          {
            couponId: order.couponId,
            orderId: order.id,
            customerEmail: order.customerEmail,
            clerkUserId: order.clerkUserId,
            discountKobo: order.discountKobo,
          },
          tx,
        );
      } catch (err) {
        logger.error({ err, orderId: order.id }, "Failed to record coupon redemption");
      }
    }

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

    return { kind: "activated" as const, orderId: order.id, expiresAt, order };
  });

  if (claim.kind === "not_found") {
    logger.error({ reference }, "Activation attempted for unknown order reference");
    return { outcome: "failed", orderId: null };
  }
  if (claim.kind === "already_active") {
    return { outcome: "already_active", orderId: claim.orderId, expiresAt: claim.expiresAt };
  }
  if (claim.kind === "failed") {
    return { outcome: "failed", orderId: claim.orderId };
  }
  if (claim.kind === "underpaid") {
    return { outcome: "underpaid", orderId: claim.orderId };
  }

  const { order, orderId, expiresAt } = claim;

  // Create a review prompt record for this purchase so the customer can be asked
  // to review it on future login sessions. Ignore collisions (already exists).
  if (order.clerkUserId) {
    try {
      await db.insert(reviewPromptsTable).values({
        clerkUserId: order.clerkUserId,
        orderId: order.id,
        productId: order.productId,
      }).onConflictDoNothing();
    } catch (err) {
      logger.warn({ err, orderId: order.id }, "Failed to create review prompt record");
    }
  }

  // Referral completion runs only for the caller that actually won the
  // activation claim above, so a qualifying purchase is rewarded exactly once.
  // It's also internally idempotent and never throws, so it can't affect the
  // entitlement result even if called again in some future edge case.
  await processQualifyingPurchase(order);

  return { outcome: "activated", orderId, expiresAt };
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

  // The status transition is the idempotency gate: only the caller that
  // actually flips the order to "failed" for the first time refunds credit.
  // Repeated failure events (Paystack retries/duplicate webhooks) for an
  // order that's already marked failed are safe no-ops for the refund, while
  // the entitlement revoke below always re-runs (harmless if already revoked)
  // so a later dispute/reversal on a previously-activated order still removes access.
  const claimed = await db
    .update(ordersTable)
    .set({ status: "failed" })
    .where(and(eq(ordersTable.id, order.id), ne(ordersTable.status, "failed")))
    .returning();

  await db
    .update(toolEntitlementsTable)
    .set({ status: "revoked" })
    .where(eq(toolEntitlementsTable.orderId, order.id));

  if (claimed.length === 0) return;

  // Release the coupon usage slot reserved at order-creation time, since the
  // purchase never actually completed. Guarded above so this can only run
  // once per order.
  if (order.couponId) {
    await releaseCouponUsage(order.couponId);
  }

  // Refund any store credit that was debited at order-creation time, since
  // the purchase never actually completed. Guarded above so this can only
  // run once per order.
  if (order.creditAppliedKobo > 0 && order.clerkUserId) {
    try {
      await adjustCredit({
        clerkUserId: order.clerkUserId,
        amountKobo: order.creditAppliedKobo,
        reason: "order_failed_refund",
        orderId: order.id,
      });
    } catch (err) {
      logger.error({ err, orderId: order.id }, "Failed to refund store credit for failed order");
    }
  }
}
