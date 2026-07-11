import crypto from "crypto";
import { db, conversionEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const PIXEL_ID = process.env.META_PIXEL_ID ?? "";
const ACCESS_TOKEN = process.env.META_CONVERSIONS_API_TOKEN ?? "";
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE;
const SITE_URL = process.env.SITE_URL ?? "";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

export interface CapiUserData {
  email?: string;
  firstName?: string;
  lastName?: string;
  externalId?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbp?: string;
  fbc?: string;
}

export interface CapiEvent {
  eventName: string;
  eventId: string;
  eventSourceUrl?: string;
  userData?: CapiUserData;
  customData?: Record<string, unknown>;
  reference?: string;
}

/**
 * Send a server-side event to the Meta Conversions API.
 * Idempotent — duplicate event_ids are silently skipped via DB unique constraint.
 * Never throws: safe to fire-and-forget without blocking the payment flow.
 * Returns true when the event was actually sent, false when skipped or not configured.
 */
export async function sendCapiEvent(event: CapiEvent): Promise<boolean> {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    logger.warn("META_PIXEL_ID or META_CONVERSIONS_API_TOKEN not set — CAPI skipped");
    return false;
  }

  try {
    // Optimistic dedup: insert a "sending" row. If event_id already exists, skip.
    const inserted = await db
      .insert(conversionEventsTable)
      .values({
        eventId: event.eventId,
        eventName: event.eventName,
        reference: event.reference ?? null,
        status: "sending",
      })
      .onConflictDoNothing()
      .returning({ id: conversionEventsTable.id });

    if (!inserted.length) {
      logger.info({ eventId: event.eventId }, "CAPI duplicate skipped");
      return false;
    }

    const ud = event.userData ?? {};
    const userData: Record<string, string> = {};
    if (ud.email) userData.em = sha256(ud.email);
    if (ud.firstName) userData.fn = sha256(ud.firstName);
    if (ud.lastName) userData.ln = sha256(ud.lastName);
    if (ud.externalId) userData.external_id = sha256(ud.externalId);
    if (ud.clientIpAddress) userData.client_ip_address = ud.clientIpAddress;
    if (ud.clientUserAgent) userData.client_user_agent = ud.clientUserAgent;
    if (ud.fbp) userData.fbp = ud.fbp;
    if (ud.fbc) userData.fbc = ud.fbc;

    const payload = {
      data: [
        {
          event_name: event.eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: event.eventId,
          action_source: "website",
          event_source_url: event.eventSourceUrl ?? SITE_URL,
          user_data: userData,
          custom_data: event.customData ?? {},
        },
      ],
      ...(TEST_EVENT_CODE ? { test_event_code: TEST_EVENT_CODE } : {}),
    };

    const url = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;

    let fetchErr: string | null = null;
    let metaErr: string | null = null;
    let eventsReceived: number | undefined;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        events_received?: number;
        error?: { message: string };
      };
      if (body.error) {
        metaErr = body.error.message;
      } else {
        eventsReceived = body.events_received;
      }
    } catch (err) {
      fetchErr = err instanceof Error ? err.message : String(err);
    }

    if (fetchErr || metaErr) {
      const msg = fetchErr ?? metaErr ?? "unknown";
      logger.error({ eventId: event.eventId, err: msg }, fetchErr ? "CAPI network error" : "CAPI event rejected by Meta");
      await db
        .update(conversionEventsTable)
        .set({ status: "failed", errorMessage: msg })
        .where(eq(conversionEventsTable.eventId, event.eventId));
      return false;
    }

    logger.info({ eventId: event.eventId, eventsReceived }, "CAPI event delivered");
    await db
      .update(conversionEventsTable)
      .set({ status: "sent" })
      .where(eq(conversionEventsTable.eventId, event.eventId));
    return true;
  } catch (err) {
    // Outer catch for unexpected errors (e.g. DB connection down at dedup stage)
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ eventId: event.eventId, err: msg }, "CAPI unexpected error");
    return false;
  }
}

export function getCapiStatus() {
  return {
    pixelConfigured: !!PIXEL_ID,
    tokenConfigured: !!ACCESS_TOKEN,
    testEventCode: TEST_EVENT_CODE ?? null,
    siteUrlConfigured: !!SITE_URL,
    maskedToken: ACCESS_TOKEN
      ? `${"*".repeat(Math.max(0, ACCESS_TOKEN.length - 4))}${ACCESS_TOKEN.slice(-4)}`
      : null,
  };
}
