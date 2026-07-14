import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, referralsTable, userCreditsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireSuperAdmin } from "../lib/staffAuth";
import { logger } from "../lib/logger";
import { ensureReferralCode } from "../lib/referrals";
import { getReferralSettings, updateReferralSettings } from "../lib/referralSettings";
import { getCreditBalance } from "../lib/credits";

const router: IRouter = Router();

router.get("/users/me/referral", async (req, res): Promise<void> => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const code = await ensureReferralCode(auth.userId);
    const referrals = await db
      .select()
      .from(referralsTable)
      .where(eq(referralsTable.referrerClerkUserId, auth.userId))
      .orderBy(desc(referralsTable.createdAt));

    const completed = referrals.filter((r) => r.status === "completed");
    res.json({
      code,
      totalReferrals: referrals.length,
      completedReferrals: completed.length,
      pendingReferrals: referrals.filter((r) => r.status === "pending").length,
      totalRewardedKobo: completed.reduce((sum, r) => sum + (r.rewardGranted ? r.rewardKobo ?? 0 : 0), 0),
      referrals: referrals.map((r) => ({
        id: r.id,
        status: r.status,
        rewardKobo: r.rewardGranted ? r.rewardKobo : null,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      })),
    });
  } catch (err) {
    logger.error({ err }, "Failed to load referral summary");
    res.status(500).json({ error: "Failed to load referral summary" });
  }
});

router.get("/users/me/credit", async (req, res): Promise<void> => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json({ balanceKobo: await getCreditBalance(auth.userId) });
  } catch (err) {
    logger.error({ err }, "Failed to load credit balance");
    res.status(500).json({ error: "Failed to load credit balance" });
  }
});

router.get("/admin/referral-settings", requireSuperAdmin, async (_req, res): Promise<void> => {
  try {
    res.json(await getReferralSettings());
  } catch (err) {
    logger.error({ err }, "Failed to fetch referral settings");
    res.status(500).json({ error: "Failed to fetch referral settings" });
  }
});

router.put("/admin/referral-settings", requireSuperAdmin, async (req, res): Promise<void> => {
  try {
    const {
      enabled,
      rewardType,
      rewardValue,
      rewardProductId,
      minPurchaseKobo,
      campaignStartsAt,
      campaignEndsAt,
      maxRewardsPerReferrer,
    } = req.body as {
      enabled?: boolean;
      rewardType?: string;
      rewardValue?: number;
      rewardProductId?: number | null;
      minPurchaseKobo?: number;
      campaignStartsAt?: string | null;
      campaignEndsAt?: string | null;
      maxRewardsPerReferrer?: number | null;
    };

    if (rewardType !== undefined && !["percentage", "fixed", "store_credit", "free_product"].includes(rewardType)) {
      res.status(400).json({ error: "rewardType must be one of: percentage, fixed, store_credit, free_product." });
      return;
    }
    if (rewardValue !== undefined && (!Number.isInteger(rewardValue) || rewardValue < 0)) {
      res.status(400).json({ error: "rewardValue must be a non-negative whole number." });
      return;
    }
    if (rewardType === "free_product" && rewardProductId == null && (await getReferralSettings()).rewardProductId == null) {
      res.status(400).json({ error: "A reward product must be selected for the free_product reward type." });
      return;
    }

    const patch: Record<string, unknown> = {};
    if (enabled !== undefined) patch.enabled = enabled;
    if (rewardType !== undefined) patch.rewardType = rewardType;
    if (rewardValue !== undefined) patch.rewardValue = rewardValue;
    if (rewardProductId !== undefined) patch.rewardProductId = rewardProductId;
    if (minPurchaseKobo !== undefined) patch.minPurchaseKobo = minPurchaseKobo;
    if (campaignStartsAt !== undefined) patch.campaignStartsAt = campaignStartsAt ? new Date(campaignStartsAt) : null;
    if (campaignEndsAt !== undefined) patch.campaignEndsAt = campaignEndsAt ? new Date(campaignEndsAt) : null;
    if (maxRewardsPerReferrer !== undefined) patch.maxRewardsPerReferrer = maxRewardsPerReferrer;

    const updated = await updateReferralSettings(patch, req.staffUser?.email);
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update referral settings");
    res.status(500).json({ error: "Failed to update referral settings" });
  }
});

router.get("/admin/referrals", requireSuperAdmin, async (_req, res): Promise<void> => {
  try {
    const referrals = await db.select().from(referralsTable).orderBy(desc(referralsTable.createdAt));

    const topReferrersRaw = await db
      .select({
        clerkUserId: referralsTable.referrerClerkUserId,
        completedCount: sql<number>`count(*) filter (where ${referralsTable.status} = 'completed')::int`,
        totalRewardedKobo: sql<number>`coalesce(sum(${referralsTable.rewardKobo}) filter (where ${referralsTable.rewardGranted} = true), 0)::int`,
      })
      .from(referralsTable)
      .groupBy(referralsTable.referrerClerkUserId)
      .orderBy(desc(sql`count(*) filter (where ${referralsTable.status} = 'completed')`))
      .limit(10);

    res.json({
      referrals: referrals.map((r) => ({
        id: r.id,
        referrerClerkUserId: r.referrerClerkUserId,
        refereeClerkUserId: r.refereeClerkUserId,
        refereeEmail: r.refereeEmail,
        status: r.status,
        qualifyingOrderId: r.qualifyingOrderId,
        rewardType: r.rewardType,
        rewardKobo: r.rewardKobo,
        rewardGranted: r.rewardGranted,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      })),
      totalReferrals: referrals.length,
      completedReferrals: referrals.filter((r) => r.status === "completed").length,
      pendingReferrals: referrals.filter((r) => r.status === "pending").length,
      rejectedReferrals: referrals.filter((r) => r.status === "rejected").length,
      totalRewardedKobo: referrals.reduce((sum, r) => sum + (r.rewardGranted ? r.rewardKobo ?? 0 : 0), 0),
      topReferrers: topReferrersRaw,
    });
  } catch (err) {
    logger.error({ err }, "Failed to list referrals");
    res.status(500).json({ error: "Failed to list referrals" });
  }
});

router.get("/admin/user-credits/:clerkUserId", requireSuperAdmin, async (req, res): Promise<void> => {
  try {
    const clerkUserId = String(req.params.clerkUserId);
    const [row] = await db.select().from(userCreditsTable).where(eq(userCreditsTable.clerkUserId, clerkUserId));
    res.json({ balanceKobo: row?.balanceKobo ?? 0 });
  } catch (err) {
    logger.error({ err }, "Failed to load user credit balance");
    res.status(500).json({ error: "Failed to load user credit balance" });
  }
});

export default router;
