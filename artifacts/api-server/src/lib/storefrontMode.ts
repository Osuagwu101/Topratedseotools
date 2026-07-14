import { db, featureFlagsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Server-side enforcement for Maintenance / Coming Soon / Read-Only modes.
 * The frontend takeover screen (App.tsx) and checkout banner are the
 * primary UX, but every mutating checkout endpoint checks this too so the
 * mode can't be bypassed by a client that already has the page open or
 * talks to the API directly. Scoped deliberately to *new* checkout writes
 * (order creation, payment initialization) — it does not touch payment
 * verification/webhooks, since an order already in flight before the mode
 * was turned on must still be allowed to complete.
 */
export async function checkCheckoutWritesAllowed(): Promise<{ allowed: true } | { allowed: false; message: string }> {
  const [flags] = await db
    .select({
      maintenanceMode: featureFlagsTable.maintenanceMode,
      comingSoonMode: featureFlagsTable.comingSoonMode,
      readOnlyMode: featureFlagsTable.readOnlyMode,
    })
    .from(featureFlagsTable)
    .where(eq(featureFlagsTable.id, 1));

  if (!flags) return { allowed: true };

  if (flags.maintenanceMode) {
    return { allowed: false, message: "The store is down for maintenance right now. Please check back shortly." };
  }
  if (flags.comingSoonMode) {
    return { allowed: false, message: "The store isn't open yet. Please check back soon." };
  }
  if (flags.readOnlyMode) {
    return { allowed: false, message: "The store is in read-only mode right now, so new purchases can't be completed. Please check back shortly." };
  }
  return { allowed: true };
}
