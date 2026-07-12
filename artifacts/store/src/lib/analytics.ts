declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fbq?: (...args: any[]) => void;
    _fbq?: unknown;
    dataLayer?: unknown[];
  }
}

// ── Runtime config (loaded from /api/tracking/config at startup) ─────────────
// Keeps VITE_ vars as a compile-time fallback in case the fetch hasn't happened yet.
let runtimePixelEnabled: boolean = !!import.meta.env.VITE_META_PIXEL_ID;
let runtimePixelId: string | undefined = import.meta.env.VITE_META_PIXEL_ID as string | undefined;
let runtimeGtmEnabled: boolean = !!import.meta.env.VITE_GTM_ID;
let runtimeGtmId: string | undefined = import.meta.env.VITE_GTM_ID as string | undefined;

export interface TrackingConfig {
  metaPixelEnabled: boolean;
  metaPixelId: string | null;
  gtmEnabled: boolean;
  gtmContainerId: string | null;
}

/** Called by App.tsx after fetching /api/tracking/config. Idempotent. */
export function setTrackingConfig(config: TrackingConfig): void {
  runtimePixelEnabled = config.metaPixelEnabled;
  runtimePixelId = config.metaPixelId ?? undefined;
  runtimeGtmEnabled = config.gtmEnabled;
  runtimeGtmId = config.gtmContainerId ?? undefined;
}

let pixelInitialized = false;
let gtmInjected = false;

// ── Consent ──────────────────────────────────────────────────────────────────

export function getConsent(): "granted" | "denied" | null {
  try {
    const v = localStorage.getItem("tracking_consent");
    if (v === "granted" || v === "denied") return v as "granted" | "denied";
  } catch {
    // ignore storage errors
  }
  return null;
}

export function setConsent(granted: boolean): void {
  try {
    localStorage.setItem("tracking_consent", granted ? "granted" : "denied");
  } catch {
    // ignore
  }
  pushDataLayer({
    event: "consent_update",
    analytics_storage: granted ? "granted" : "denied",
    ad_storage: granted ? "granted" : "denied",
  });
  if (granted) initPixel();
}

// ── DataLayer ────────────────────────────────────────────────────────────────

export function pushDataLayer(data: Record<string, unknown>): void {
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(data);
}

// ── GTM ──────────────────────────────────────────────────────────────────────

/**
 * Initialize Google Tag Manager with default-denied Google Consent Mode.
 * Safe to call once on app startup regardless of user consent status.
 * Requires setTrackingConfig() to have been called first.
 */
export function initGtm(): void {
  if (!runtimeGtmEnabled || !runtimeGtmId || gtmInjected) return;
  gtmInjected = true;

  // Google Consent Mode — default denied before user responds
  window.dataLayer = window.dataLayer ?? [];
  pushDataLayer({ "gtm.start": new Date().getTime(), event: "gtm.js" });
  pushDataLayer({
    event: "consent_default",
    analytics_storage: "denied",
    ad_storage: "denied",
    functionality_storage: "granted",
    security_storage: "granted",
    wait_for_update: 500,
  });

  // Inject GTM script
  const script = document.createElement("script");
  script.id = "gtm-js";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${runtimeGtmId}`;
  document.head.appendChild(script);

  // GTM noscript iframe
  const noscript = document.createElement("noscript");
  const iframe = document.createElement("iframe");
  iframe.src = `https://www.googletagmanager.com/ns.html?id=${runtimeGtmId}`;
  iframe.height = "0";
  iframe.width = "0";
  iframe.style.display = "none";
  iframe.style.visibility = "hidden";
  noscript.appendChild(iframe);
  if (document.body) {
    document.body.insertBefore(noscript, document.body.firstChild);
  }
}

// ── Meta Pixel ───────────────────────────────────────────────────────────────

/**
 * Initialize Meta Pixel. Only call after the user grants consent.
 * Requires setTrackingConfig() to have been called first.
 * Idempotent — safe to call multiple times.
 */
export function initPixel(): void {
  if (!runtimePixelEnabled || !runtimePixelId || pixelInitialized) return;
  if (getConsent() !== "granted") return;

  if (!window.fbq) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fbq: any = function (...args: unknown[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fbq as any).callMethod ? (fbq as any).callMethod(...args) : (fbq as any).queue.push(args);
    };
    window.fbq = fbq;
    window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    const first = document.getElementsByTagName("script")[0];
    first?.parentNode?.insertBefore(script, first);
  }

  window.fbq?.("init", runtimePixelId);
  pixelInitialized = true;
}

// ── Events ───────────────────────────────────────────────────────────────────

export function trackPageView(): void {
  pushDataLayer({
    event: "page_view",
    page_title: document.title,
    page_location: window.location.href,
    page_path: window.location.pathname,
  });
  if (pixelInitialized) {
    window.fbq?.("track", "PageView");
  }
}

export function trackViewContent(params: {
  toolId: string | number;
  toolName: string;
  priceKobo: number;
  currency: string;
}): void {
  const value = params.priceKobo / 100;
  pushDataLayer({
    event: "view_item",
    ecommerce: {
      currency: params.currency,
      value,
      items: [{ item_id: String(params.toolId), item_name: params.toolName, price: value, quantity: 1 }],
    },
  });
  if (pixelInitialized) {
    window.fbq?.("track", "ViewContent", {
      content_ids: [String(params.toolId)],
      content_name: params.toolName,
      content_type: "product",
      value,
      currency: params.currency,
    }, { eventID: `view_${params.toolId}_${Date.now()}` });
  }
}

export function trackInitiateCheckout(params: {
  toolId: string | number;
  toolName: string;
  priceKobo: number;
  currency: string;
}): void {
  const value = params.priceKobo / 100;
  pushDataLayer({
    event: "begin_checkout",
    ecommerce: {
      currency: params.currency,
      value,
      items: [{ item_id: String(params.toolId), item_name: params.toolName, price: value, quantity: 1 }],
    },
  });
  if (pixelInitialized) {
    window.fbq?.("track", "InitiateCheckout", {
      content_ids: [String(params.toolId)],
      content_name: params.toolName,
      content_type: "product",
      value,
      currency: params.currency,
      num_items: 1,
    }, { eventID: `checkout_${params.toolId}_${Date.now()}` });
  }
}

/**
 * Track a verified purchase.
 * Uses a stable event_id (purchase_{reference}) matching the server-side CAPI event.
 * Idempotent via sessionStorage — safe when the success page is refreshed.
 */
export function trackPurchase(params: {
  reference: string;
  toolId: string | number;
  toolName: string;
  amountKobo: number;
  currency: string;
}): void {
  const firedKey = `purchase_fired_${params.reference}`;
  try {
    if (sessionStorage.getItem(firedKey)) return;
    sessionStorage.setItem(firedKey, "1");
  } catch {
    // ignore
  }

  const value = params.amountKobo / 100;
  const eventId = `purchase_${params.reference}`;

  pushDataLayer({
    event: "purchase",
    ecommerce: {
      transaction_id: params.reference,
      currency: params.currency,
      value,
      items: [{ item_id: String(params.toolId), item_name: params.toolName, price: value, quantity: 1 }],
    },
  });

  if (pixelInitialized) {
    window.fbq?.("track", "Purchase", {
      content_ids: [String(params.toolId)],
      content_name: params.toolName,
      content_type: "product",
      value,
      currency: params.currency,
      num_items: 1,
      order_id: params.reference,
    }, { eventID: eventId });
  }
}

// ── Homepage-specific named events ────────────────────────────────────────────
// Simple custom dataLayer events for on-page engagement tracking (separate from
// the GA4-shaped ecommerce events above, which cover checkout/purchase).

export function trackHomepageViewed(): void {
  pushDataLayer({ event: "homepage_viewed" });
}

export function trackBrowseToolsClicked(source: string): void {
  pushDataLayer({ event: "browse_tools_clicked", source });
}

export function trackToolCardViewed(toolId: string | number, toolName: string): void {
  pushDataLayer({ event: "tool_card_viewed", tool_id: String(toolId), tool_name: toolName });
}

export function trackToolSelected(toolId: string | number, toolName: string): void {
  pushDataLayer({ event: "tool_selected", tool_id: String(toolId), tool_name: toolName });
}

export function trackBuyNowClicked(toolId: string | number, toolName: string): void {
  pushDataLayer({ event: "buy_now_clicked", tool_id: String(toolId), tool_name: toolName });
}

export function trackWhatsappSupportClicked(): void {
  pushDataLayer({ event: "whatsapp_support_clicked" });
}

export function trackFaqOpened(question: string): void {
  pushDataLayer({ event: "faq_opened", question });
}

export { runtimePixelId as PIXEL_ID, runtimeGtmId as GTM_ID };
