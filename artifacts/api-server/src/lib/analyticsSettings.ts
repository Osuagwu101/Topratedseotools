import crypto from "crypto";
import { db, analyticsSettingsTable } from "@workspace/db";
import { logger } from "./logger";

function getDerivedKey(): Buffer {
  // SESSION_SECRET is required at startup (see startupValidation.ts) — the
  // server never boots without it, so there is no insecure fallback here.
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set; cannot encrypt/decrypt analytics tokens.");
  }
  return crypto.createHash("sha256").update(`analytics-token-key:${secret}`).digest();
}

export function encryptToken(plaintext: string): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid ciphertext format");
  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getDerivedKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

export function maskToken(plaintext: string): string {
  if (!plaintext) return "";
  const visible = Math.min(4, plaintext.length);
  const stars = Math.max(16, plaintext.length - visible);
  return "*".repeat(stars) + plaintext.slice(-visible);
}

export interface IntegrationSettings {
  metaPixel: { enabled: boolean; pixelId: string | null };
  metaCapi: {
    enabled: boolean;
    pixelId: string | null;
    tokenConfigured: boolean;
    maskedToken: string | null;
    testEventCode: string | null;
    siteUrl: string | null;
  };
  googleTagManager: { enabled: boolean; containerId: string | null };
  updatedAt: string | null;
  updatedBy: string | null;
}

function safeDecrypt(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null;
  try { return decryptToken(encrypted); } catch { return null; }
}

export async function getIntegrationSettings(): Promise<IntegrationSettings> {
  try {
    const rows = await db.select().from(analyticsSettingsTable).limit(1);
    const row = rows[0];

    const envPixelId = process.env.META_PIXEL_ID ?? null;
    const envGtmId = process.env.GOOGLE_TAG_MANAGER_ID ?? null;
    const envToken = process.env.META_CONVERSIONS_API_TOKEN ?? null;
    const envTestCode = process.env.META_TEST_EVENT_CODE ?? null;
    const envSiteUrl = process.env.SITE_URL ?? null;

    if (!row) {
      return {
        metaPixel: { enabled: !!envPixelId, pixelId: envPixelId },
        metaCapi: {
          enabled: !!envToken,
          pixelId: envPixelId,
          tokenConfigured: !!envToken,
          maskedToken: envToken ? maskToken(envToken) : null,
          testEventCode: envTestCode,
          siteUrl: envSiteUrl,
        },
        googleTagManager: { enabled: !!envGtmId, containerId: envGtmId },
        updatedAt: null,
        updatedBy: null,
      };
    }

    const pixelId = row.metaPixelId ?? envPixelId;
    const rawToken = safeDecrypt(row.metaCapiTokenEncrypted) ?? envToken;

    return {
      metaPixel: { enabled: row.metaPixelEnabled, pixelId },
      metaCapi: {
        enabled: row.metaCapiEnabled,
        pixelId,
        tokenConfigured: !!rawToken,
        maskedToken: rawToken ? maskToken(rawToken) : null,
        testEventCode: row.metaTestEventCode ?? envTestCode,
        siteUrl: row.siteUrl ?? envSiteUrl,
      },
      googleTagManager: { enabled: row.gtmEnabled, containerId: row.gtmContainerId ?? envGtmId },
      updatedAt: row.updatedAt?.toISOString() ?? null,
      updatedBy: row.updatedBy ?? null,
    };
  } catch (err) {
    logger.error({ err }, "Failed to load analytics settings");
    return {
      metaPixel: { enabled: false, pixelId: null },
      metaCapi: { enabled: false, pixelId: null, tokenConfigured: false, maskedToken: null, testEventCode: null, siteUrl: null },
      googleTagManager: { enabled: false, containerId: null },
      updatedAt: null,
      updatedBy: null,
    };
  }
}

export async function getCapiRuntimeSettings(): Promise<{
  pixelId: string;
  accessToken: string;
  testEventCode: string | undefined;
  siteUrl: string;
  enabled: boolean;
}> {
  const fallback = {
    pixelId: process.env.META_PIXEL_ID ?? "",
    accessToken: process.env.META_CONVERSIONS_API_TOKEN ?? "",
    testEventCode: process.env.META_TEST_EVENT_CODE,
    siteUrl: process.env.SITE_URL ?? "",
    enabled: false,
  };
  try {
    const rows = await db.select().from(analyticsSettingsTable).limit(1);
    const row = rows[0];
    if (!row) return { ...fallback, enabled: !!fallback.accessToken };

    const pixelId = row.metaPixelId ?? fallback.pixelId;
    const accessToken = safeDecrypt(row.metaCapiTokenEncrypted) ?? fallback.accessToken;
    return {
      pixelId,
      accessToken,
      testEventCode: row.metaTestEventCode ?? fallback.testEventCode,
      siteUrl: row.siteUrl ?? fallback.siteUrl,
      enabled: row.metaCapiEnabled,
    };
  } catch {
    return { ...fallback, enabled: !!fallback.accessToken };
  }
}

async function upsertSettings(
  partial: Partial<typeof analyticsSettingsTable.$inferInsert>,
  updatedBy: string,
): Promise<void> {
  const now = new Date();
  await db
    .insert(analyticsSettingsTable)
    .values({ id: 1, ...partial, updatedAt: now, updatedBy })
    .onConflictDoUpdate({
      target: analyticsSettingsTable.id,
      set: { ...partial, updatedAt: now, updatedBy },
    });
}

export async function saveMetaPixelSettings(
  data: { enabled: boolean; pixelId: string | null },
  updatedBy: string,
): Promise<void> {
  await upsertSettings({ metaPixelEnabled: data.enabled, metaPixelId: data.pixelId || null }, updatedBy);
}

export async function saveMetaCapiSettings(
  data: { enabled: boolean; accessToken?: string; testEventCode?: string | null; siteUrl?: string | null },
  updatedBy: string,
): Promise<void> {
  const partial: Partial<typeof analyticsSettingsTable.$inferInsert> = { metaCapiEnabled: data.enabled };
  if (data.accessToken !== undefined) {
    partial.metaCapiTokenEncrypted = data.accessToken ? encryptToken(data.accessToken) : null;
  }
  if (data.testEventCode !== undefined) partial.metaTestEventCode = data.testEventCode || null;
  if (data.siteUrl !== undefined) partial.siteUrl = data.siteUrl || null;
  await upsertSettings(partial, updatedBy);
}

export async function saveGtmSettings(
  data: { enabled: boolean; containerId: string | null },
  updatedBy: string,
): Promise<void> {
  await upsertSettings({ gtmEnabled: data.enabled, gtmContainerId: data.containerId || null }, updatedBy);
}

export async function getPublicTrackingConfig(): Promise<{
  metaPixelEnabled: boolean;
  metaPixelId: string | null;
  gtmEnabled: boolean;
  gtmContainerId: string | null;
}> {
  try {
    const rows = await db.select().from(analyticsSettingsTable).limit(1);
    const row = rows[0];
    const envPixelId = process.env.META_PIXEL_ID ?? null;
    const envGtmId = process.env.GOOGLE_TAG_MANAGER_ID ?? null;
    if (!row) {
      return { metaPixelEnabled: !!envPixelId, metaPixelId: envPixelId, gtmEnabled: !!envGtmId, gtmContainerId: envGtmId };
    }
    return {
      metaPixelEnabled: row.metaPixelEnabled,
      metaPixelId: row.metaPixelId ?? envPixelId,
      gtmEnabled: row.gtmEnabled,
      gtmContainerId: row.gtmContainerId ?? envGtmId,
    };
  } catch {
    return { metaPixelEnabled: false, metaPixelId: null, gtmEnabled: false, gtmContainerId: null };
  }
}
