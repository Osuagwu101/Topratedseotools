export interface Attribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  fbclid?: string;
  gclid?: string;
}

const STORAGE_KEY = "trst_attribution";
const FBC_KEY = "trst_fbc";

/**
 * Capture UTM parameters and click identifiers from the current URL.
 * First-touch attribution: stores once per session, does not overwrite.
 */
export function captureAttribution(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get("fbclid") ?? undefined;
    const gclid = params.get("gclid") ?? undefined;
    const utmSource = params.get("utm_source") ?? undefined;
    const utmMedium = params.get("utm_medium") ?? undefined;
    const utmCampaign = params.get("utm_campaign") ?? undefined;
    const utmContent = params.get("utm_content") ?? undefined;
    const utmTerm = params.get("utm_term") ?? undefined;

    if (!utmSource && !fbclid && !gclid) return;

    // Only store first-touch — don't overwrite existing session attribution
    if (!sessionStorage.getItem(STORAGE_KEY)) {
      const attr: Attribution = {
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmTerm,
        fbclid,
        gclid,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attr));
    }

    // Store fbc in localStorage (survives navigation)
    if (fbclid && !localStorage.getItem(FBC_KEY)) {
      localStorage.setItem(FBC_KEY, `fb.1.${Date.now()}.${fbclid}`);
    }
  } catch {
    // ignore storage errors
  }
}

export function getAttribution(): Attribution | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
}

export function getFbc(): string | null {
  try {
    return localStorage.getItem(FBC_KEY);
  } catch {
    return null;
  }
}

export function getFbp(): string | null {
  try {
    const match = document.cookie.match(/(^|;)\s*_fbp=([^;]+)/);
    return match ? (match[2] ?? null) : null;
  } catch {
    return null;
  }
}
