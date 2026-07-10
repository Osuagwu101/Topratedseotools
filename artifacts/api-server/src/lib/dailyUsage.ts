import { db, userDailyUsageTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

/**
 * Current calendar date in West African Time (WAT / Africa/Lagos, UTC+1, no
 * DST) as YYYY-MM-DD. Daily usage counters reset the instant it becomes a new
 * day in Lagos, regardless of where the server or the requesting user is.
 */
export function getWatDateString(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${year}-${month}-${day}`;
}

export type DailyUsageStatus = {
  limit: number | null;
  used: number;
  remaining: number | null;
};

/**
 * Reads today's (WAT) usage count for a user/tool without mutating it.
 */
export async function getDailyUsage(userId: string, toolId: number): Promise<number> {
  const usageDate = getWatDateString();
  const [row] = await db
    .select({ inputCount: userDailyUsageTable.inputCount })
    .from(userDailyUsageTable)
    .where(
      and(
        eq(userDailyUsageTable.userId, userId),
        eq(userDailyUsageTable.toolId, toolId),
        eq(userDailyUsageTable.usageDate, usageDate),
      ),
    );
  return row?.inputCount ?? 0;
}

/**
 * Atomically checks a subscriber's daily task usage against the tool's
 * maxDailyInputs cap and increments it if allowed. Null/0 maxDailyInputs
 * means unlimited (no row is ever written). Uses an upsert with a
 * conditional increment so concurrent requests can't race past the limit.
 */
export async function checkAndConsumeDailyUsage(
  userId: string,
  toolId: number,
  maxDailyInputs: number | null,
): Promise<{ allowed: boolean } & DailyUsageStatus> {
  if (!maxDailyInputs || maxDailyInputs <= 0) {
    return { allowed: true, limit: null, used: 0, remaining: null };
  }

  const usageDate = getWatDateString();

  // Upsert: insert a fresh row at 1, or bump inputCount only if still under
  // the cap. If the row exists and is already at/over the cap, the update
  // predicate fails and inputCount is left untouched (WHERE clause on the
  // conflict target keeps this atomic under concurrent requests).
  const [row] = await db
    .insert(userDailyUsageTable)
    .values({ userId, toolId, usageDate, inputCount: 1 })
    .onConflictDoUpdate({
      target: [userDailyUsageTable.userId, userDailyUsageTable.toolId, userDailyUsageTable.usageDate],
      set: { inputCount: sql`${userDailyUsageTable.inputCount} + 1` },
      setWhere: sql`${userDailyUsageTable.inputCount} < ${maxDailyInputs}`,
    })
    .returning({ inputCount: userDailyUsageTable.inputCount });

  if (row && row.inputCount <= maxDailyInputs) {
    return {
      allowed: true,
      limit: maxDailyInputs,
      used: row.inputCount,
      remaining: maxDailyInputs - row.inputCount,
    };
  }

  // Conflict update was skipped (already at/over cap) — re-read actual count.
  const used = await getDailyUsage(userId, toolId);
  return { allowed: false, limit: maxDailyInputs, used, remaining: 0 };
}
