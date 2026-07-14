import {
  db,
  referralCodesTable,
  referralsTable,
  ordersTable,
  userDeviceSessionsTable,
  toolEntitlementsTable,
  type Order,
} from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { logger } from "./logger";
import { getReferralSettings } from "./referralSettings";
import { adjustCredit } from "./credits";
import { pickDefaultServerForProduct } from "./toolAccess";

function generateReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export async function ensureReferralCode(clerkUserId: string): Promise<string> {
  const [existing] = await db.select().from(referralCodesTable).where(eq(referralCodesTable.clerkUserId, clerkUserId));
  if (existing) return existing.code;

  // Retry on the rare code collision (unique constraint on `code`).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      await db.insert(referralCodesTable).values({ clerkUserId, code });
      return code;
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  throw new Error("Failed to generate a unique referral code");
}

async function sharesDeviceWith(userA: string, userB: string): Promise<boolean> {
  const [devicesA, devicesB] = await Promise.all([
    db.select({ deviceId: userDeviceSessionsTable.deviceId }).from(userDeviceSessionsTable).where(eq(userDeviceSessionsTable.userId, userA)),
    db.select({ deviceId: userDeviceSessionsTable.deviceId }).from(userDeviceSessionsTable).where(eq(userDeviceSessionsTable.userId, userB)),
  ]);
  const setA = new Set(devicesA.map((d) => d.deviceId));
  return devicesB.some((d) => setA.has(d.deviceId));
}

/**
 * Called after a purchase is successfully activated (see activateOrder.ts).
 * Idempotent: safe to call for every successful order, not just the first.
 * Creates or resolves the referral relationship and grants the reward once
 * a qualifying purchase is confirmed. Never throws — referral processing
 * must never block or roll back the underlying order/entitlement flow.
 */
export async function processQualifyingPurchase(order: Order): Promise<void> {
  try {
    if (!order.clerkUserId) return; // guest orders can't be tied to a referred account

    const settings = await getReferralSettings();
    const now = new Date();

    let referral = (
      await db.select().from(referralsTable).where(eq(referralsTable.refereeClerkUserId, order.clerkUserId))
    )[0];

    if (!referral) {
      if (!order.referralCode) return; // no referral link involved
      const [refCode] = await db.select().from(referralCodesTable).where(eq(referralCodesTable.code, order.referralCode));
      if (!refCode) return; // unknown/stale referral code — ignore silently

      if (refCode.clerkUserId === order.clerkUserId) {
        logger.warn({ orderId: order.id }, "Referral ignored — self-referral");
        return; // never even create a row for self-referrals
      }

      // Fraud check: same person buying under a second account (matching email
      // on an existing order from the referrer).
      const [selfByEmail] = await db
        .select()
        .from(ordersTable)
        .where(and(eq(ordersTable.clerkUserId, refCode.clerkUserId), eq(ordersTable.customerEmail, order.customerEmail)));
      if (selfByEmail) {
        await db.insert(referralsTable).values({
          referrerClerkUserId: refCode.clerkUserId,
          refereeClerkUserId: order.clerkUserId,
          refereeEmail: order.customerEmail,
          status: "rejected",
          qualifyingOrderId: order.id,
          note: "Referrer and referee share a customer email address.",
        });
        return;
      }

      const sharedDevice = await sharesDeviceWith(refCode.clerkUserId, order.clerkUserId);
      if (sharedDevice) {
        await db.insert(referralsTable).values({
          referrerClerkUserId: refCode.clerkUserId,
          refereeClerkUserId: order.clerkUserId,
          refereeEmail: order.customerEmail,
          status: "rejected",
          qualifyingOrderId: order.id,
          note: "Referrer and referee share a known device — likely self-referral.",
        });
        return;
      }

      try {
        const [created] = await db
          .insert(referralsTable)
          .values({
            referrerClerkUserId: refCode.clerkUserId,
            refereeClerkUserId: order.clerkUserId,
            refereeEmail: order.customerEmail,
            status: "pending",
            qualifyingOrderId: order.id,
          })
          .returning();
        referral = created;
      } catch (err) {
        // Unique constraint on refereeClerkUserId — a referral for this user
        // already exists (race between concurrent orders). Re-fetch and
        // continue evaluation below instead of failing.
        logger.warn({ err, clerkUserId: order.clerkUserId }, "Referral row already exists for this referee");
        referral = (
          await db.select().from(referralsTable).where(eq(referralsTable.refereeClerkUserId, order.clerkUserId))
        )[0];
        if (!referral) return;
      }
    }

    if (referral.status !== "pending") return; // already completed or rejected — nothing more to do

    if (!settings.enabled) return; // stay pending until the programme is re-enabled
    if (settings.campaignStartsAt && settings.campaignStartsAt > now) return;
    if (settings.campaignEndsAt && settings.campaignEndsAt < now) return;
    const qualifyingBaseAmountKobo = order.baseAmountKobo ?? 0;
    if (settings.minPurchaseKobo > 0 && qualifyingBaseAmountKobo < settings.minPurchaseKobo) return; // stays pending for a future order

    // Atomically claim the pending -> completed transition before granting
    // any reward. If a concurrent qualifying purchase for the same referee
    // (e.g. two near-simultaneous orders) already claimed it, this update
    // affects zero rows and we bail out without paying a second reward.
    const [claimed] = await db
      .update(referralsTable)
      .set({ status: "completed", qualifyingOrderId: order.id, completedAt: now })
      .where(and(eq(referralsTable.id, referral.id), eq(referralsTable.status, "pending")))
      .returning();
    if (!claimed) {
      logger.warn({ referralId: referral.id, orderId: order.id }, "Referral already claimed by a concurrent purchase — skipping reward");
      return;
    }

    // Cap check — referral still counts as "completed" for reporting, just without a payout.
    let rewardGranted = false;
    let rewardKobo: number | null = null;
    let note: string | null = null;

    if (settings.maxRewardsPerReferrer != null) {
      const rewarded = await db
        .select()
        .from(referralsTable)
        .where(and(eq(referralsTable.referrerClerkUserId, referral.referrerClerkUserId), eq(referralsTable.rewardGranted, true)));
      if (rewarded.length >= settings.maxRewardsPerReferrer) {
        note = "Referrer reached their maximum rewarded referrals — no reward granted.";
      }
    }

    if (!note) {
      if (settings.rewardType === "free_product" && settings.rewardProductId) {
        try {
          const serverId = await pickDefaultServerForProduct(settings.rewardProductId);
          await db.insert(toolEntitlementsTable).values({
            clerkUserId: referral.referrerClerkUserId,
            productId: settings.rewardProductId,
            serverId,
            reference: `REFERRAL-${referral.id}`,
            status: "active",
            expiresAt: (() => {
              const d = new Date();
              d.setMonth(d.getMonth() + 1);
              return d;
            })(),
          });
          rewardGranted = true;
        } catch (err) {
          logger.error({ err, referralId: referral.id }, "Failed to grant free-product referral reward");
          note = "Free product reward could not be granted automatically.";
        }
      } else {
        rewardKobo =
          settings.rewardType === "percentage"
            ? Math.round(qualifyingBaseAmountKobo * (settings.rewardValue / 100))
            : settings.rewardValue;
        await adjustCredit({
          clerkUserId: referral.referrerClerkUserId,
          amountKobo: rewardKobo,
          reason: "referral_reward",
          referralId: referral.id,
          orderId: order.id,
        });
        rewardGranted = true;
      }
    }

    await db
      .update(referralsTable)
      .set({
        rewardType: settings.rewardType,
        rewardKobo,
        rewardGranted,
        note,
      })
      .where(eq(referralsTable.id, referral.id));
  } catch (err) {
    logger.error({ err, orderId: order.id }, "Referral processing failed — order/entitlement flow unaffected");
  }
}
