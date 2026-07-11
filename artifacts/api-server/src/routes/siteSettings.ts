import { Router, type IRouter, type RequestHandler } from "express";
import multer from "multer";
import { db, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { objectStorageClient } from "../lib/objectStorage";

const router: IRouter = Router();

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Allowed: PNG, JPG, JPEG, WebP, SVG"));
    }
  },
});

const requireAdmin: RequestHandler = (req, res, next) => {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    res.status(503).json({ error: "Admin credentials not configured." });
    return;
  }

  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Basic ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(auth.slice(6), "base64").toString("utf-8");
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const colonIdx = decoded.indexOf(":");
  const u = colonIdx >= 0 ? decoded.slice(0, colonIdx) : decoded;
  const p = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : "";

  if (u !== adminUsername || p !== adminPassword) {
    res.status(401).json({ error: "Wrong username or password." });
    return;
  }

  next();
};

async function ensureSettings() {
  const rows = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
  if (rows.length === 0) {
    await db.insert(siteSettingsTable).values({ id: 1 });
    const newRows = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
    return newRows[0];
  }
  return rows[0];
}

function firstPublicSearchPath(): string {
  const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
  const first = pathsStr.split(",").map((p) => p.trim()).filter(Boolean)[0];
  if (!first) throw new Error("PUBLIC_OBJECT_SEARCH_PATHS not set.");
  return first;
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const parts = normalized.split("/");
  if (parts.length < 3) throw new Error("Invalid object storage path.");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

router.get("/site-settings", async (_req, res): Promise<void> => {
  try {
    const settings = await ensureSettings();
    res.json(settings);
  } catch (err) {
    logger.error({ err }, "Failed to fetch site settings");
    res.status(500).json({ error: "Failed to fetch site settings" });
  }
});

router.get("/admin/site-settings", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const settings = await ensureSettings();
    res.json(settings);
  } catch (err) {
    logger.error({ err }, "Failed to fetch site settings");
    res.status(500).json({ error: "Failed to fetch site settings" });
  }
});

router.put("/admin/site-settings", requireAdmin, async (req, res): Promise<void> => {
  try {
    const {
      siteHeadline,
      siteSubheadline,
      paymentFooterText,
      copyrightText,
      copyrightYear,
      useDynamicCopyrightYear,
    } = req.body as {
      siteHeadline?: string;
      siteSubheadline?: string;
      paymentFooterText?: string;
      copyrightText?: string;
      copyrightYear?: string;
      useDynamicCopyrightYear?: boolean;
    };

    if (siteHeadline !== undefined && !siteHeadline.trim()) {
      res.status(400).json({ error: "Headline cannot be empty." });
      return;
    }
    if (siteSubheadline !== undefined && !siteSubheadline.trim()) {
      res.status(400).json({ error: "Subheadline cannot be empty." });
      return;
    }
    if (copyrightText !== undefined && !copyrightText.trim()) {
      res.status(400).json({ error: "Copyright text cannot be empty." });
      return;
    }

    await ensureSettings();

    const updates: Partial<typeof siteSettingsTable.$inferInsert> = {
      updatedAt: new Date(),
      updatedBy: req.headers["x-admin-user"] as string | undefined ?? "admin",
    };
    if (siteHeadline !== undefined) updates.siteHeadline = siteHeadline.trim();
    if (siteSubheadline !== undefined) updates.siteSubheadline = siteSubheadline.trim();
    if (paymentFooterText !== undefined) updates.paymentFooterText = paymentFooterText.trim();
    if (copyrightText !== undefined) updates.copyrightText = copyrightText.trim();
    if (copyrightYear !== undefined) updates.copyrightYear = copyrightYear.trim();
    if (useDynamicCopyrightYear !== undefined) updates.useDynamicCopyrightYear = useDynamicCopyrightYear;

    await db.update(siteSettingsTable).set(updates).where(eq(siteSettingsTable.id, 1));
    const updated = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
    res.json(updated[0]);
  } catch (err) {
    logger.error({ err }, "Failed to update site settings");
    res.status(500).json({ error: "Failed to update site settings" });
  }
});

router.post(
  "/admin/site-settings/logo",
  requireAdmin,
  logoUpload.single("logo"),
  async (req, res): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded." });
        return;
      }

      let buffer = req.file.buffer;

      if (req.file.mimetype !== "image/svg+xml") {
        buffer = await sharp(buffer)
          .resize(200, 60, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
      }

      const ext = req.file.mimetype === "image/svg+xml" ? "svg" : "webp";
      const relativePath = `site-logos/logo-${randomUUID()}.${ext}`;
      const fullPath = `${firstPublicSearchPath()}/${relativePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);

      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      await file.save(buffer, {
        contentType: req.file.mimetype === "image/svg+xml" ? "image/svg+xml" : "image/webp",
        metadata: { cacheControl: "public, max-age=86400" },
      });

      const logoUrl = `/api/storage/public-objects/${relativePath}`;

      await ensureSettings();
      await db
        .update(siteSettingsTable)
        .set({ siteLogoUrl: logoUrl, updatedAt: new Date(), updatedBy: "admin" })
        .where(eq(siteSettingsTable.id, 1));

      res.json({ siteLogoUrl: logoUrl });
    } catch (err) {
      logger.error({ err }, "Failed to upload site logo");
      res.status(500).json({ error: "Failed to upload logo" });
    }
  },
);

router.delete("/admin/site-settings/logo", requireAdmin, async (_req, res): Promise<void> => {
  try {
    await ensureSettings();
    await db
      .update(siteSettingsTable)
      .set({ siteLogoUrl: null, updatedAt: new Date(), updatedBy: "admin" })
      .where(eq(siteSettingsTable.id, 1));
    res.json({ siteLogoUrl: null });
  } catch (err) {
    logger.error({ err }, "Failed to remove site logo");
    res.status(500).json({ error: "Failed to remove logo" });
  }
});

export default router;
