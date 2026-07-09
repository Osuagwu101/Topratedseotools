export interface ParsedUserAgent {
  browser: string;
  os: string;
  deviceType: "Mobile" | "Tablet" | "Desktop";
}

/**
 * Lightweight user-agent parser (no external dependency) that extracts a
 * best-effort browser name, OS name, and device type for display purposes.
 * Not exhaustive — good enough for the admin device-sessions view.
 */
export function parseUserAgent(userAgent: string | null): ParsedUserAgent {
  if (!userAgent) {
    return { browser: "Unknown", os: "Unknown", deviceType: "Desktop" };
  }

  const ua = userAgent;

  let os = "Unknown";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/CrOS/i.test(ua)) os = "ChromeOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Unknown";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = "Opera";
  else if (/CriOS/i.test(ua)) browser = "Chrome";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/FxiOS/i.test(ua)) browser = "Firefox";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  let deviceType: ParsedUserAgent["deviceType"] = "Desktop";
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    deviceType = "Tablet";
  } else if (/Mobi|iPhone|Android/i.test(ua)) {
    deviceType = "Mobile";
  }

  return { browser, os, deviceType };
}
