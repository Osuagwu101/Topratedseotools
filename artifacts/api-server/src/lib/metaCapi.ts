import crypto from "crypto";
import { db, conversionEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { getCapiRuntimeSettings } from "./analyticsSettings";

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
 * Settings are loaded from the DB (with env-var fallback) on each call.
 * Idempotent — duplicate event_ids are silently skipped via DB unique constraint.
 * Never throws: safe to fire-and-forget without blocking the payment flow.
 * Returns true when the event was actually sent, false when skipped or not configured.
 */
export async function sendCapiEvent(event: CapiEvent): Promise<boolean> {
  const settings = await getCapiRuntimeSettings();

  if (!settings.enabled || !settings.pixelId || !settings.accessToken) {
    logger.warn("CAPI not enabled or missing credentials — skipped");
    return false;
  }

  const PIXEL_ID = settings.pixelId;
  const ACCESS_TOKEN = settings.accessToken;
  const TEST_EVENT_CODE = settings.testEventCode;
  const SITE_URL = settings.siteUrl;

  try {
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
      logger.error(
        { eventId: event.eventId, err: msg },
        fetchErr ? "CAPI network error" : "CAPI event rejected by Meta",
      );
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
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ eventId: event.eventId, err: msg }, "CAPI unexpected error");
    return false;
  }
}
