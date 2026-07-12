import { Router, type IRouter } from "express";
import { db, blogSettingsTable, newsletterSubscribersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { logger } from "../lib/logger";
import { attachStaffUser, requireStaffRole } from "../lib/staffAuth";

const router: IRouter = Router();
router.use(attachStaffUser);

async function getOrCreateSettings() {
  const [row] = await db.select().from(blogSettingsTable).limit(1);
  if (row) return row;
  const [created] = await db.insert(blogSettingsTable).values({}).returning();
  return created;
}

router.get("/blog/settings", async (_req, res): Promise<void> => {
  res.json(await getOrCreateSettings());
});

router.get("/admin/blog/settings", requireStaffRole("administrator", "editor", "author"), async (_req, res): Promise<void> => {
  res.json(await getOrCreateSettings());
});

router.put("/admin/blog/settings", requireStaffRole("administrator"), async (req, res): Promise<void> => {
  try {
    const current = await getOrCreateSettings();
    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const stringFields = ["blogTitle", "blogIntro", "imageOutputFormat"];
    for (const f of stringFields) if (typeof body[f] === "string") updates[f] = body[f];
    const numberFields = ["postsPerPage", "imageQuality", "maxImageWidth"];
    for (const f of numberFields) if (typeof body[f] === "number") updates[f] = body[f];
    const boolFields = ["autoFilenameCleaning", "autoAltTextSuggestion", "commentsEnabledGlobally", "newsletterEnabled", "rssEnabled"];
    for (const f of boolFields) if (typeof body[f] === "boolean") updates[f] = body[f];
    const [updated] = await db.update(blogSettingsTable).set(updates as never).where(eq(blogSettingsTable.id, current.id)).returning();
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update blog settings");
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// ── Newsletter ────────────────────────────────────────────────────────────────

router.post("/blog/newsletter/subscribe", async (req, res): Promise<void> => {
  try {
    const { email, source } = req.body as { email?: string; source?: string };
    if (!email?.trim() || !email.includes("@")) {
      res.status(400).json({ error: "A valid email is required." });
      return;
    }
    const normalized = email.trim().toLowerCase();
    const [existing] = await db.select().from(newsletterSubscribersTable).where(eq(newsletterSubscribersTable.email, normalized)).limit(1);
    if (existing) {
      res.json({ message: "Already subscribed." });
      return;
    }
    await db.insert(newsletterSubscribersTable).values({
      email: normalized,
      source: source === "homepage" ? "homepage" : "blog",
      unsubscribeToken: randomBytes(16).toString("hex"),
    });
    res.status(201).json({ message: "Subscribed successfully." });
  } catch (err) {
    logger.error({ err }, "Newsletter subscription failed");
    res.status(500).json({ error: "Subscription failed" });
  }
});

router.get("/admin/blog/newsletter/subscribers", requireStaffRole("administrator", "editor"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(newsletterSubscribersTable).orderBy(newsletterSubscribersTable.subscribedAt);
  res.json(rows);
});

export default router;
