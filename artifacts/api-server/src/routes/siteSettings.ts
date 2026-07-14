import { Router, type IRouter, type RequestHandler } from "express";
import multer from "multer";
import { db, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { objectStorageClient } from "../lib/objectStorage";
import { requireSuperAdmin } from "../lib/staffAuth";

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

// Shared Super Admin gate — see lib/staffAuth.ts.
const requireAdmin: RequestHandler = requireSuperAdmin;

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
      businessEmail,
      businessEmailPublic,
      businessEmailClickable,
      whatsappNumber,
      whatsappMessage,
      whatsappEnabled,
      paymentIconsEnabled,
      supportPageMessage,
      testimonialsEnabled,
      maxTestimonialsPerPage,
      testimonialDisplayPages,
      verifiedAccessBadgeEnabled,
      customersServedBaseline,
      customersServedCountingMethod,
      customersServedManualCorrection,
      heroPrimaryButtonText,
      heroSecondaryButtonText,
      heroTrustLine,
      heroPrimaryButtonLink,
      heroSecondaryButtonLink,
      finalCtaHeadline,
      finalCtaSubtext,
      finalCtaButtonText,
      finalCtaButtonLink,
      seoTitle,
      seoDescription,
      seoCanonicalUrl,
      seoOgImageUrl,
      homepageSectionsConfig,
    } = req.body as {
      siteHeadline?: string;
      siteSubheadline?: string;
      paymentFooterText?: string;
      copyrightText?: string;
      copyrightYear?: string;
      useDynamicCopyrightYear?: boolean;
      businessEmail?: string | null;
      businessEmailPublic?: boolean;
      businessEmailClickable?: boolean;
      whatsappNumber?: string | null;
      whatsappMessage?: string | null;
      whatsappEnabled?: boolean;
      paymentIconsEnabled?: boolean;
      supportPageMessage?: string | null;
      testimonialsEnabled?: boolean;
      maxTestimonialsPerPage?: number;
      testimonialDisplayPages?: string[];
      verifiedAccessBadgeEnabled?: boolean;
      customersServedBaseline?: number;
      customersServedCountingMethod?: string;
      customersServedManualCorrection?: number;
      heroPrimaryButtonText?: string;
      heroSecondaryButtonText?: string | null;
      heroTrustLine?: string | null;
      heroPrimaryButtonLink?: string | null;
      heroSecondaryButtonLink?: string | null;
      finalCtaHeadline?: string | null;
      finalCtaSubtext?: string | null;
      finalCtaButtonText?: string;
      finalCtaButtonLink?: string | null;
      seoTitle?: string | null;
      seoDescription?: string | null;
      seoCanonicalUrl?: string | null;
      seoOgImageUrl?: string | null;
      homepageSectionsConfig?: string | null;
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
    if (businessEmail !== undefined && businessEmail !== null && businessEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail.trim())) {
      res.status(400).json({ error: "Invalid business email address." });
      return;
    }
    if (customersServedBaseline !== undefined && (!Number.isInteger(customersServedBaseline) || customersServedBaseline < 0)) {
      res.status(400).json({ error: "Baseline must be a positive whole number." });
      return;
    }
    if (customersServedManualCorrection !== undefined && !Number.isInteger(customersServedManualCorrection)) {
      res.status(400).json({ error: "Manual correction must be a whole number." });
      return;
    }
    if (customersServedCountingMethod !== undefined && !["unique_customers", "orders"].includes(customersServedCountingMethod)) {
      res.status(400).json({ error: "Counting method must be 'unique_customers' or 'orders'." });
      return;
    }
    if (maxTestimonialsPerPage !== undefined && (!Number.isInteger(maxTestimonialsPerPage) || maxTestimonialsPerPage < 1)) {
      res.status(400).json({ error: "Max testimonials per page must be a positive whole number." });
      return;
    }
    if (testimonialDisplayPages !== undefined && !Array.isArray(testimonialDisplayPages)) {
      res.status(400).json({ error: "testimonialDisplayPages must be an array of page identifiers." });
      return;
    }
    if (heroPrimaryButtonText !== undefined && !heroPrimaryButtonText.trim()) {
      res.status(400).json({ error: "Hero primary button text cannot be empty." });
      return;
    }
    if (finalCtaButtonText !== undefined && !finalCtaButtonText.trim()) {
      res.status(400).json({ error: "Final CTA button text cannot be empty." });
      return;
    }
    if (homepageSectionsConfig !== undefined && homepageSectionsConfig !== null) {
      try {
        JSON.parse(homepageSectionsConfig);
      } catch {
        res.status(400).json({ error: "homepageSectionsConfig must be valid JSON." });
        return;
      }
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
    if (businessEmail !== undefined) updates.businessEmail = businessEmail ? businessEmail.trim() : null;
    if (businessEmailPublic !== undefined) updates.businessEmailPublic = businessEmailPublic;
    if (businessEmailClickable !== undefined) updates.businessEmailClickable = businessEmailClickable;
    if (whatsappNumber !== undefined) updates.whatsappNumber = whatsappNumber ? whatsappNumber.trim() : null;
    if (whatsappMessage !== undefined) updates.whatsappMessage = whatsappMessage ? whatsappMessage.trim() : null;
    if (whatsappEnabled !== undefined) updates.whatsappEnabled = whatsappEnabled;
    if (paymentIconsEnabled !== undefined) updates.paymentIconsEnabled = paymentIconsEnabled;
    if (supportPageMessage !== undefined) updates.supportPageMessage = supportPageMessage ? supportPageMessage.trim() : null;
    if (testimonialsEnabled !== undefined) updates.testimonialsEnabled = testimonialsEnabled;
    if (maxTestimonialsPerPage !== undefined) updates.maxTestimonialsPerPage = maxTestimonialsPerPage;
    if (testimonialDisplayPages !== undefined) updates.testimonialDisplayPages = testimonialDisplayPages.map((p) => p.trim()).filter(Boolean);
    if (verifiedAccessBadgeEnabled !== undefined) updates.verifiedAccessBadgeEnabled = verifiedAccessBadgeEnabled;
    if (customersServedBaseline !== undefined) updates.customersServedBaseline = customersServedBaseline;
    if (customersServedCountingMethod !== undefined) updates.customersServedCountingMethod = customersServedCountingMethod;
    if (customersServedManualCorrection !== undefined) updates.customersServedManualCorrection = customersServedManualCorrection;
    if (heroPrimaryButtonText !== undefined) updates.heroPrimaryButtonText = heroPrimaryButtonText.trim();
    if (heroSecondaryButtonText !== undefined) updates.heroSecondaryButtonText = heroSecondaryButtonText ? heroSecondaryButtonText.trim() : null;
    if (heroTrustLine !== undefined) updates.heroTrustLine = heroTrustLine ? heroTrustLine.trim() : null;
    if (heroPrimaryButtonLink !== undefined) updates.heroPrimaryButtonLink = heroPrimaryButtonLink ? heroPrimaryButtonLink.trim() : null;
    if (heroSecondaryButtonLink !== undefined) updates.heroSecondaryButtonLink = heroSecondaryButtonLink ? heroSecondaryButtonLink.trim() : null;
    if (finalCtaHeadline !== undefined) updates.finalCtaHeadline = finalCtaHeadline ? finalCtaHeadline.trim() : null;
    if (finalCtaSubtext !== undefined) updates.finalCtaSubtext = finalCtaSubtext ? finalCtaSubtext.trim() : null;
    if (finalCtaButtonText !== undefined) updates.finalCtaButtonText = finalCtaButtonText.trim();
    if (finalCtaButtonLink !== undefined) updates.finalCtaButtonLink = finalCtaButtonLink ? finalCtaButtonLink.trim() : null;
    if (seoTitle !== undefined) updates.seoTitle = seoTitle ? seoTitle.trim() : null;
    if (seoDescription !== undefined) updates.seoDescription = seoDescription ? seoDescription.trim() : null;
    if (seoCanonicalUrl !== undefined) updates.seoCanonicalUrl = seoCanonicalUrl ? seoCanonicalUrl.trim() : null;
    if (seoOgImageUrl !== undefined) updates.seoOgImageUrl = seoOgImageUrl ? seoOgImageUrl.trim() : null;
    if (homepageSectionsConfig !== undefined) updates.homepageSectionsConfig = homepageSectionsConfig;

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

router.post(
  "/admin/site-settings/hero-image",
  requireAdmin,
  logoUpload.single("image"),
  async (req, res): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded." });
        return;
      }

      let buffer = req.file.buffer;
      if (req.file.mimetype !== "image/svg+xml") {
        buffer = await sharp(buffer)
          .resize(1600, 1200, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
      }

      const ext = req.file.mimetype === "image/svg+xml" ? "svg" : "webp";
      const relativePath = `hero-images/hero-${randomUUID()}.${ext}`;
      const fullPath = `${firstPublicSearchPath()}/${relativePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);

      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      await file.save(buffer, {
        contentType: req.file.mimetype === "image/svg+xml" ? "image/svg+xml" : "image/webp",
        metadata: { cacheControl: "public, max-age=86400" },
      });

      const heroImageUrl = `/api/storage/public-objects/${relativePath}`;

      await ensureSettings();
      await db
        .update(siteSettingsTable)
        .set({ heroImageUrl, updatedAt: new Date(), updatedBy: "admin" })
        .where(eq(siteSettingsTable.id, 1));

      res.json({ heroImageUrl });
    } catch (err) {
      logger.error({ err }, "Failed to upload hero image");
      res.status(500).json({ error: "Failed to upload hero image" });
    }
  },
);

router.delete("/admin/site-settings/hero-image", requireAdmin, async (_req, res): Promise<void> => {
  try {
    await ensureSettings();
    await db
      .update(siteSettingsTable)
      .set({ heroImageUrl: null, updatedAt: new Date(), updatedBy: "admin" })
      .where(eq(siteSettingsTable.id, 1));
    res.json({ heroImageUrl: null });
  } catch (err) {
    logger.error({ err }, "Failed to remove hero image");
    res.status(500).json({ error: "Failed to remove hero image" });
  }
});

export default router;
