import { db, userCreditsTable, creditTransactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

// Accepts either the top-level db client or a transaction handle, so callers
// that already hold a row lock (e.g. order creation debiting credit) can run
// this within their own transaction instead of opening a second one.
type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getCreditBalance(clerkUserId: string, executor: DbExecutor = db): Promise<number> {
  const [row] = await executor.select().from(userCreditsTable).where(eq(userCreditsTable.clerkUserId, clerkUserId));
  return row?.balanceKobo ?? 0;
}

/**
 * Locks (or creates, if missing) a user's credit balance row for the
 * duration of the caller's transaction and returns the current balance.
 * Must be called inside a `db.transaction`. Any concurrent caller that also
 * locks this row (directly or via `adjustCredit`) blocks until this
 * transaction commits, which is what makes a read-then-spend sequence
 * (check balance, then debit it) safe against double-spending.
 */
export async function lockCreditBalanceForUpdate(
  tx: Exclude<DbExecutor, typeof db>,
  clerkUserId: string,
): Promise<number> {
  await tx.insert(userCreditsTable).values({ clerkUserId, balanceKobo: 0 }).onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(userCreditsTable)
    .where(eq(userCreditsTable.clerkUserId, clerkUserId))
    .for("update");
  return row?.balanceKobo ?? 0;
}

/**
 * Adds (or subtracts, if amountKobo is negative) store credit for a user and
 * records the transaction. Uses an upsert so the first credit for a user
 * creates their balance row. When called with an existing transaction
 * handle, runs inline within it instead of opening a nested one — callers
 * that already hold the row lock (via `lockCreditBalanceForUpdate`) should
 * pass their `tx` here so the debit is part of the same atomic step.
 */
export async function adjustCredit(
  params: {
    clerkUserId: string;
    amountKobo: number;
    reason: string;
    referralId?: number | null;
    orderId?: number | null;
  },
  executor: DbExecutor = db,
): Promise<number> {
  const run = async (tx: Exclude<DbExecutor, typeof db> | typeof db) => {
    await tx
      .insert(userCreditsTable)
      .values({ clerkUserId: params.clerkUserId, balanceKobo: params.amountKobo })
      .onConflictDoUpdate({
        target: userCreditsTable.clerkUserId,
        set: { balanceKobo: sql`${userCreditsTable.balanceKobo} + ${params.amountKobo}`, updatedAt: new Date() },
      });
    await tx.insert(creditTransactionsTable).values({
      clerkUserId: params.clerkUserId,
      amountKobo: params.amountKobo,
      reason: params.reason,
      referralId: params.referralId ?? null,
      orderId: params.orderId ?? null,
    });
    const [row] = await tx.select().from(userCreditsTable).where(eq(userCreditsTable.clerkUserId, params.clerkUserId));
    return row?.balanceKobo ?? 0;
  };
  if (executor === db) return db.transaction(run);
  return run(executor);
}
