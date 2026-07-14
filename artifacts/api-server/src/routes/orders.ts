import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, ordersTable, productsTable, orderAttributionsTable, featureFlagsTable } from "@workspace/db";
import {
  CreateOrderBody,
  CreateOrderResponse,
  GetOrderParams,
  GetOrderResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { logger } from "../lib/logger";
import { getPaymentSettings } from "../lib/paymentSettings";
import { computeOrderAmounts } from "../lib/paymentCalculation";
import { validateCoupon, normalizeCouponCode, reserveCouponUsage } from "../lib/coupons";
import { adjustCredit, lockCreditBalanceForUpdate } from "../lib/credits";

const router: IRouter = Router();

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [flags] = await db
    .select({ marketplaceEnabled: featureFlagsTable.marketplaceEnabled })
    .from(featureFlagsTable)
    .where(eq(featureFlagsTable.id, 1));
  if (flags && !flags.marketplaceEnabled) {
    res.status(403).json({ error: "The marketplace is temporarily unavailable. Please check back soon." });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, parsed.data.productId));

  if (!product || product.isDeleted || product.isHidden) {
    res.status(400).json({ error: "Product not found" });
    return;
  }

  const paymentSettings = await getPaymentSettings();
  if (!paymentSettings.enabled) {
    res.status(400).json({ error: "Payments are currently unavailable. Please try again later." });
    return;
  }

  const reference = `SUB-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;

  // Associate order with logged-in user if authenticated
  const auth = getAuth(req);
  const clerkUserId = auth?.userId ?? null;

  const durationMonths = parsed.data.durationMonths ?? 1;
  const priceByDuration: Record<number, number | null> = {
    1: product.priceKobo,
    3: product.price3MonthKobo,
    12: product.price12MonthKobo,
  };
  const priceForDuration = priceByDuration[durationMonths];
  if (durationMonths !== 1 && (priceForDuration === undefined || priceForDuration === null)) {
    res.status(400).json({ error: `No price configured for ${durationMonths}-month duration` });
    return;
  }
  const baseAmountKobo = priceForDuration ?? product.priceKobo;

  if (paymentSettings.minPurchaseKobo > 0 && baseAmountKobo < paymentSettings.minPurchaseKobo) {
    res.status(400).json({ error: `This purchase is below the minimum allowed amount.` });
    return;
  }
  if (paymentSettings.maxPurchaseKobo != null && baseAmountKobo > paymentSettings.maxPurchaseKobo) {
    res.status(400).json({ error: `This purchase exceeds the maximum allowed amount.` });
    return;
  }

  // Coupon — validated and computed server-side; the client only ever sends the code.
  let discountKobo = 0;
  let appliedCouponId: number | null = null;
  let appliedCouponCode: string | null = null;
  if (parsed.data.couponCode) {
    const result = await validateCoupon({
      code: parsed.data.couponCode,
      productId: parsed.data.productId,
      baseAmountKobo,
      clerkUserId,
      customerEmail: parsed.data.customerEmail,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    discountKobo = result.discountKobo;
    appliedCouponId = result.coupon.id;
    appliedCouponCode = result.coupon.code;
  }

  // Referral code captured client-side from a ?ref= link (see attribution.ts pattern),
  // recorded for processing once the order is actually paid.
  const referralHeader = req.headers["x-referral-code"];
  const referralCode = typeof referralHeader === "string" && referralHeader ? normalizeCouponCode(referralHeader) : null;

  // Coupon usage limits, store credit, and the order itself are all claimed
  // inside a single transaction:
  // - reserveCouponUsage atomically claims a usage slot (total + per-customer
  //   limits) and locks the coupon row for the rest of this transaction, so
  //   concurrent checkouts against a nearly-exhausted coupon can never both
  //   succeed (see coupons.ts for why this must happen at reservation time,
  //   not at payment time, to actually prevent over-redemption).
  // - lockCreditBalanceForUpdate locks the user's credit-balance row so two
  //   simultaneous orders can never both spend the same available balance.
  // Both reservations are released (coupon usedCount decremented, credit
  // refunded) if the order later fails or is underpaid — see activateOrder.ts.
  class CouponLimitError extends Error {}
  let order: typeof ordersTable.$inferSelect;
  try {
    order = await db.transaction(async (tx) => {
      if (appliedCouponId) {
        const reservation = await reserveCouponUsage(tx, {
          couponId: appliedCouponId,
          clerkUserId,
          customerEmail: parsed.data.customerEmail,
        });
        if (!reservation.ok) throw new CouponLimitError(reservation.error);
      }

      let creditAppliedKobo = 0;
      const remainingAfterCoupon = Math.max(0, baseAmountKobo - discountKobo);
      if (parsed.data.useStoreCredit && clerkUserId) {
        const balanceKobo = await lockCreditBalanceForUpdate(tx, clerkUserId);
        creditAppliedKobo = Math.min(balanceKobo, remainingAfterCoupon);
      }

      const discountedBaseAmountKobo = Math.max(0, baseAmountKobo - discountKobo - creditAppliedKobo);
      const breakdown = computeOrderAmounts(discountedBaseAmountKobo, paymentSettings);

      const [inserted] = await tx
        .insert(ordersTable)
        .values({
          productId: parsed.data.productId,
          customerEmail: parsed.data.customerEmail,
          customerName: parsed.data.customerName,
          amountKobo: breakdown.totalKobo,
          baseAmountKobo: breakdown.baseAmountKobo,
          taxKobo: breakdown.taxKobo,
          feeKobo: breakdown.feeKobo,
          currency: paymentSettings.currency,
          status: "pending",
          reference,
          clerkUserId,
          durationMonths,
          couponId: appliedCouponId,
          couponCode: appliedCouponCode,
          discountKobo,
          creditAppliedKobo,
          referralCode,
        })
        .returning();

      // Debit store credit immediately at order creation (not at payment
      // success) so it can't be spent twice across two concurrent pending
      // orders. Refunded automatically if the order later fails/underpays.
      if (creditAppliedKobo > 0 && clerkUserId) {
        await adjustCredit(
          {
            clerkUserId,
            amountKobo: -creditAppliedKobo,
            reason: "checkout_redeem",
            orderId: inserted.id,
          },
          tx,
        );
      }

      return inserted;
    });
  } catch (err) {
    if (err instanceof CouponLimitError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  // Persist UTM/click attribution sent by the client via X-Attribution header (optional)
  const attributionHeader = req.headers["x-attribution"];
  if (typeof attributionHeader === "string" && attributionHeader) {
    try {
      const attr = JSON.parse(attributionHeader) as {
        utmSource?: string;
        utmMedium?: string;
        utmCampaign?: string;
        utmContent?: string;
        utmTerm?: string;
        fbclid?: string;
        gclid?: string;
        fbp?: string;
        fbc?: string;
      };
      await db.insert(orderAttributionsTable).values({
        orderId: order.id,
        utmSource: attr.utmSource ?? null,
        utmMedium: attr.utmMedium ?? null,
        utmCampaign: attr.utmCampaign ?? null,
        utmContent: attr.utmContent ?? null,
        utmTerm: attr.utmTerm ?? null,
        fbclid: attr.fbclid ?? null,
        gclid: attr.gclid ?? null,
        fbp: attr.fbp ?? null,
        fbc: attr.fbc ?? null,
      }).onConflictDoNothing();
    } catch (err) {
      // Non-fatal — attribution is best-effort
      logger.warn({ err, orderId: order.id }, "Failed to save order attribution");
    }
  }

  res.status(201).json(CreateOrderResponse.parse({ ...order, createdAt: order.createdAt.toISOString() }));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, params.data.id));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json(GetOrderResponse.parse({ ...order, createdAt: order.createdAt.toISOString() }));
});

export default router;
