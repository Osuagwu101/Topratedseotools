import { db, generationUsageLogTable, type SeoGeneratorSettings, type GenerationUsageLogAction } from "@workspace/db";
import { and, gte, eq, sql } from "drizzle-orm";

function startOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Generation-only actions that count against limits (research/brief are cheap and excluded). */
const LIMITED_ACTIONS: GenerationUsageLogAction[] = ["generate_full", "generate_section", "regenerate_section"];

export async function getUsageCounts(staffUserId: number): Promise<{ todayCount: number; monthCount: number }> {
  const [todayRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(generationUsageLogTable)
    .where(
      and(
        eq(generationUsageLogTable.staffUserId, staffUserId),
        gte(generationUsageLogTable.createdAt, startOfDay()),
        sql`${generationUsageLogTable.action} IN ${LIMITED_ACTIONS}`,
      ),
    );
  const [monthRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(generationUsageLogTable)
    .where(
      and(
        gte(generationUsageLogTable.createdAt, startOfMonth()),
        sql`${generationUsageLogTable.action} IN ${LIMITED_ACTIONS}`,
      ),
    );
  return { todayCount: Number(todayRow?.count ?? 0), monthCount: Number(monthRow?.count ?? 0) };
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
}

export async function checkUsageLimits(
  staffUserId: number,
  settings: SeoGeneratorSettings,
): Promise<LimitCheckResult> {
  const { todayCount, monthCount } = await getUsageCounts(staffUserId);
  if (todayCount >= settings.perUserDailyLimit) {
    return {
      allowed: false,
      reason: `Daily generation limit reached (${settings.perUserDailyLimit} per day). Try again tomorrow or ask an administrator to raise the limit.`,
    };
  }
  if (monthCount >= settings.monthlyGenerationLimit) {
    return {
      allowed: false,
      reason: `The site-wide monthly generation limit (${settings.monthlyGenerationLimit}) has been reached. Ask an administrator to raise it in AI Generator settings.`,
    };
  }
  return { allowed: true };
}

export interface MonthlyUsageStatus {
  monthCount: number;
  monthlyGenerationLimit: number;
  warningThresholdPercent: number;
  percentUsed: number;
  isAtOrOverThreshold: boolean;
  isAtOrOverLimit: boolean;
}

/**
 * Site-wide monthly usage vs. the configured cap, used to warn administrators
 * (via an in-app banner shown on every admin blog page) before the cap
 * actually blocks generation. Computed live so it always reflects current
 * usage without needing a separate "notification sent" table.
 */
export async function getMonthlyUsageStatus(settings: SeoGeneratorSettings): Promise<MonthlyUsageStatus> {
  const [monthRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(generationUsageLogTable)
    .where(
      and(
        gte(generationUsageLogTable.createdAt, startOfMonth()),
        sql`${generationUsageLogTable.action} IN ${LIMITED_ACTIONS}`,
      ),
    );
  const monthCount = Number(monthRow?.count ?? 0);
  const monthlyGenerationLimit = settings.monthlyGenerationLimit;
  const warningThresholdPercent = settings.warningThresholdPercent;
  const percentUsed = monthlyGenerationLimit > 0 ? Math.round((monthCount / monthlyGenerationLimit) * 100) : 0;
  return {
    monthCount,
    monthlyGenerationLimit,
    warningThresholdPercent,
    percentUsed,
    isAtOrOverThreshold: percentUsed >= warningThresholdPercent,
    isAtOrOverLimit: monthCount >= monthlyGenerationLimit,
  };
}

export async function logUsage(params: {
  staffUserId: number;
  postId?: number | null;
  action: GenerationUsageLogAction;
  detail?: string;
}): Promise<void> {
  await db.insert(generationUsageLogTable).values({
    staffUserId: params.staffUserId,
    postId: params.postId ?? null,
    action: params.action,
    detail: params.detail ?? null,
  });
}
