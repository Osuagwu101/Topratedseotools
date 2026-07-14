import { db, couponsTable, couponRedemptionsTable, ordersTable, type Coupon } from "@workspace/db";
import { eq, and, or, ne, isNull, lt, sql } from "drizzle-orm";

// Accepts either the top-level db client or a transaction handle, so callers
// that already hold a row lock (see activateOrder.ts) can run this within
// their own transaction instead of opening a second one.
type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CouponValidationInput {
  code: string;
  productId: number;
  baseAmountKobo: number;
  clerkUserId: string | null;
  customerEmail: string | null;
}

export type CouponValidationResult =
  | { ok: true; coupon: Coupon; discountKobo: number }
  | { ok: false; error: string };

export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Server-side coupon validation and discount calculation. Never trust a
 * client-computed discount — this is the single source of truth used by both
 * the checkout preview endpoint and order creation.
 */
export async function validateCoupon(input: CouponValidationInput): Promise<CouponValidationResult> {
  const code = normalizeCouponCode(input.code);
  if (!code) return { ok: false, error: "Please enter a coupon code." };

  const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, code));
  if (!coupon) return { ok: false, error: "This coupon code is not valid." };
  if (!coupon.active) return { ok: false, error: "This coupon is no longer active." };

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    return { ok: false, error: "This coupon is not active yet." };
  }
  if (coupon.expiresAt && coupon.expiresAt < now) {
    return { ok: false, error: "This coupon has expired." };
  }
  if (coupon.requiresLogin && !input.clerkUserId) {
    return { ok: false, error: "Please log in to use this coupon." };
  }
  if (coupon.scope === "selected" && !coupon.productIds.includes(input.productId)) {
    return { ok: false, error: "This coupon does not apply to this product." };
  }
  if (coupon.minPurchaseKobo > 0 && input.baseAmountKobo < coupon.minPurchaseKobo) {
    return {
      ok: false,
      error: `This coupon requires a minimum purchase of ₦${(coupon.minPurchaseKobo / 100).toLocaleString()}.`,
    };
  }
  if (coupon.usageLimitTotal != null && coupon.usedCount >= coupon.usageLimitTotal) {
    return { ok: false, error: "This coupon has reached its usage limit." };
  }

  if (coupon.usageLimitPerCustomer != null) {
    const conditions = [];
    if (input.clerkUserId) conditions.push(eq(couponRedemptionsTable.clerkUserId, input.clerkUserId));
    if (input.customerEmail) conditions.push(eq(couponRedemptionsTable.customerEmail, input.customerEmail));
    if (conditions.length > 0) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(couponRedemptionsTable)
        .where(and(eq(couponRedemptionsTable.couponId, coupon.id), or(...conditions)));
      if (count >= coupon.usageLimitPerCustomer) {
        return { ok: false, error: "You have already used this coupon the maximum number of times." };
      }
    }
  }

  let discountKobo =
    coupon.discountType === "percentage"
      ? Math.round(input.baseAmountKobo * (coupon.discountValue / 100))
      : coupon.discountValue;

  if (coupon.maxDiscountKobo != null) discountKobo = Math.min(discountKobo, coupon.maxDiscountKobo);
  discountKobo = Math.max(0, Math.min(discountKobo, input.baseAmountKobo));

  return { ok: true, coupon, discountKobo };
}

/**
 * Reserves one usage slot for a coupon atomically — used at order-creation
 * time, in the same transaction as the order insert and the store-credit
 * debit, so the total/per-customer limits can never be over-committed by
 * concurrent checkouts. This is the same "reserve now, refund on failure"
 * pattern already used for store credit (see credits.ts): `usedCount` counts
 * every non-failed order that has claimed the coupon, not just paid ones, and
 * is released via `releaseCouponUsage` if the order later fails/underpays.
 *
 * The conditional `UPDATE ... WHERE usedCount < usageLimitTotal` both claims
 * the slot and takes a row lock on the coupon for the rest of this
 * transaction, which is what makes the per-customer check below safe: any
 * other concurrent claim attempt for the same coupon blocks until this
 * transaction commits or rolls back.
 */
export async function reserveCouponUsage(
  tx: Exclude<DbExecutor, typeof db>,
  params: { couponId: number; clerkUserId: string | null; customerEmail: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [claimed] = await tx
    .update(couponsTable)
    .set({ usedCount: sql`${couponsTable.usedCount} + 1` })
    .where(
      and(
        eq(couponsTable.id, params.couponId),
        or(isNull(couponsTable.usageLimitTotal), lt(couponsTable.usedCount, couponsTable.usageLimitTotal)),
      ),
    )
    .returning();

  if (!claimed) {
    return { ok: false, error: "This coupon has reached its usage limit." };
  }

  if (claimed.usageLimitPerCustomer != null && (params.clerkUserId || params.customerEmail)) {
    const conditions = [];
    if (params.clerkUserId) conditions.push(eq(ordersTable.clerkUserId, params.clerkUserId));
    if (params.customerEmail) conditions.push(eq(ordersTable.customerEmail, params.customerEmail));
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(ordersTable)
      .where(and(eq(ordersTable.couponId, params.couponId), ne(ordersTable.status, "failed"), or(...conditions)));

    // count includes only prior orders (this one hasn't been inserted yet),
    // so reaching the limit here means this order would exceed it.
    if (count >= claimed.usageLimitPerCustomer) {
      await tx
        .update(couponsTable)
        .set({ usedCount: sql`${couponsTable.usedCount} - 1` })
        .where(eq(couponsTable.id, params.couponId));
      return { ok: false, error: "You have already used this coupon the maximum number of times." };
    }
  }

  return { ok: true };
}

/**
 * Releases a previously reserved usage slot (see `reserveCouponUsage`) when
 * the order that claimed it fails or is underpaid. Floors at zero so this is
 * safe to call even if the reservation was somehow already released.
 */
export async function releaseCouponUsage(couponId: number, executor: DbExecutor = db): Promise<void> {
  await executor
    .update(couponsTable)
    .set({ usedCount: sql`GREATEST(${couponsTable.usedCount} - 1, 0)` })
    .where(eq(couponsTable.id, couponId));
}

/**
 * Records the paid-redemption audit row for analytics/history. Usage limits
 * are already enforced at reservation time (`reserveCouponUsage`), so this
 * never touches `usedCount` — it only inserts an idempotent ledger entry.
 * Called from activateOrder.ts once an order is confirmed paid.
 */
export async function recordCouponRedemption(
  params: {
    couponId: number;
    orderId: number;
    customerEmail: string;
    clerkUserId: string | null;
    discountKobo: number;
  },
  executor: DbExecutor = db,
): Promise<void> {
  // Guarded by a unique constraint on orderId — idempotent against retried/
  // duplicate calls for the same order.
  await executor
    .insert(couponRedemptionsTable)
    .values({
      couponId: params.couponId,
      orderId: params.orderId,
      customerEmail: params.customerEmail,
      clerkUserId: params.clerkUserId,
      discountKobo: params.discountKobo,
    })
    .onConflictDoNothing({ target: couponRedemptionsTable.orderId });
}

export function generateCouponCode(length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
