/**
 * Reverse proxy for auto-login tools (Phrasly, StealthWriter, etc.)
 *
 * All traffic flows through this server so the target tool always sees:
 *  - Our server's single fixed IP address
 *  - One fixed User-Agent (simulating a single device)
 *
 * Flow:
 *  1. User (authenticated + active sub) hits /api/proxy/:productId/*
 *  2. Server resolves which tool_server credential set their entitlement was
 *     granted against (falls back to the product's first auto-login server for
 *     legacy entitlements with no serverId), then checks/refreshes a
 *     server-side session for that specific server.
 *  3. Every request is forwarded from our server with the cached session
 *  4. HTML + JS responses are rewritten so all links go back through our proxy
 */

import { Router, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { db, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveServerForUser } from "../lib/toolAccess";
import { DEVICE_UA, getSession, invalidateSession } from "../lib/toolSession";
import { checkAndConsumeDailyUsage } from "../lib/dailyUsage";

const router = Router();

// ── URL rewriter ─────────────────────────────────────────────────────────────
function rewriteBody(
  text: string,
  toolOrigin: string,
  proxyBase: string,
  isHtml: boolean,
): string {
  const escaped = toolOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Replace all absolute tool-origin references
  let out = text.replace(new RegExp(escaped, "g"), proxyBase);

  if (isHtml) {
    // Replace root-relative src/href/action so they go through the proxy
    out = out
      .replace(/([\s=]src=['"])\//g, `$1${proxyBase}/`)
      .replace(/([\s=]href=['"])\//g, `$1${proxyBase}/`)
      .replace(/([\s=]action=['"])\//g, `$1${proxyBase}/`);

    // Inject <base> as fallback for relative paths inside the app shell
    out = out.replace(
      /<head([^>]*)>/i,
      `<head$1><base href="${proxyBase}/">`,
    );
  }

  return out;
}

// ── Proxy handler ────────────────────────────────────────────────────────────
const proxyHandler: RequestHandler = async (req, res): Promise<void> => {
  // Clerk auth
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).send("Unauthorized — please log in to SubsHub first.");
    return;
  }

  const productId = parseInt((req.params as any).productId, 10);
  if (isNaN(productId)) {
    res.status(400).send("Invalid product ID");
    return;
  }

  // One-Click Auth must be enabled by the admin for this tool before any
  // subscriber traffic is allowed through the masking proxy.
  const [product] = await db
    .select({ oneClickAuthEnabled: productsTable.oneClickAuthEnabled, maxDailyInputs: productsTable.maxDailyInputs })
    .from(productsTable)
    .where(eq(productsTable.id, productId));
  if (!product?.oneClickAuthEnabled) {
    res.status(403).send("One-Click Auth is not enabled for this tool.");
    return;
  }

  // Resolve entitlement + the specific server credential set assigned to it
  const server = await resolveServerForUser(auth.userId, productId);
  if (!server) {
    res.status(403).send("No active subscription for this tool.");
    return;
  }

  if (!server.loginUrl) {
    res.status(503).send("Tool not configured for proxy login. Contact admin.");
    return;
  }

  // Daily task cap (WAT calendar day) — checked/consumed BEFORE the admin
  // master session is ever attached to this request. Unlimited (null/0)
  // tools skip this entirely and are unaffected.
  const usage = await checkAndConsumeDailyUsage(auth.userId, productId, product.maxDailyInputs);
  if (!usage.allowed) {
    res.status(429).json({ error: "You have reached your daily task limit for this tool." });
    return;
  }

  let toolOrigin: string;
  try {
    toolOrigin = new URL(server.loginUrl).origin;
  } catch {
    res.status(503).send("Invalid tool login URL configured.");
    return;
  }

  // Get (or refresh) server-side session
  let session = await getSession(server);
  if (!session) {
    res.status(503).send(
      "Could not establish session — check credentials in admin panel.",
    );
    return;
  }

  // Build target URL (req.url is relative to the mount point)
  const targetPath = req.url || "/";
  const targetUrl = `${toolOrigin}${targetPath}`;
  const proxyBase = `/api/proxy/${productId}`;

  // Forward headers — fixed UA + session, strip our internal headers
  const fwdHeaders: Record<string, string> = {
    "User-Agent": DEVICE_UA,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "identity", // ask for plain text so we can rewrite
    Accept: (req.headers["accept"] as string) || "*/*",
    Host: new URL(toolOrigin).host,
    Origin: toolOrigin,
    Referer: toolOrigin + "/",
  };

  if (session.cookie) fwdHeaders["Cookie"] = session.cookie;
  if (session.authHeader) fwdHeaders["Authorization"] = session.authHeader;

  let reqBody: string | undefined;
  if (!["GET", "HEAD"].includes(req.method) && req.body) {
    reqBody = JSON.stringify(req.body);
    fwdHeaders["Content-Type"] =
      (req.headers["content-type"] as string) || "application/json";
  }

  let toolRes: Response;
  try {
    toolRes = await fetch(targetUrl, {
      method: req.method,
      headers: fwdHeaders,
      body: reqBody,
      redirect: "manual",
    });
  } catch (err) {
    res.status(502).send(`Proxy connection error: ${String(err)}`);
    return;
  }

  // If the tool returned 401/403, our session may have expired — retry once
  if (toolRes.status === 401 || toolRes.status === 403) {
    invalidateSession(server.id);
    session = await getSession(server);
    if (session) {
      if (session.cookie) fwdHeaders["Cookie"] = session.cookie;
      if (session.authHeader) fwdHeaders["Authorization"] = session.authHeader;
      try {
        toolRes = await fetch(targetUrl, {
          method: req.method,
          headers: fwdHeaders,
          body: reqBody,
          redirect: "manual",
        });
      } catch {
        // fall through with original response
      }
    }
  }

  // Update cached session with any new cookies the tool set
  const newCookies: string[] =
    typeof (toolRes.headers as any).getSetCookie === "function"
      ? (toolRes.headers as any).getSetCookie()
      : [];
  if (newCookies.length > 0 && session) {
    const merged = newCookies.map((c: string) => c.split(";")[0]).join("; ");
    session.cookie = merged;
  }

  // Redirects — rewrite Location so browser stays inside our proxy
  if (toolRes.status >= 300 && toolRes.status < 400) {
    const location = toolRes.headers.get("location") || "/";
    let rewritten: string;
    if (location.startsWith(toolOrigin)) {
      rewritten = proxyBase + location.slice(toolOrigin.length);
    } else if (location.startsWith("/")) {
      rewritten = proxyBase + location;
    } else {
      rewritten = location; // external redirect — leave as-is
    }
    res.setHeader("Location", rewritten);
    res.status(toolRes.status).end();
    return;
  }

  const contentType = toolRes.headers.get("content-type") || "";
  res.setHeader("Content-Type", contentType);
  // Allow embedding (the proxy page is opened in a new tab, but just in case)
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  res.status(toolRes.status);

  const buf = Buffer.from(await toolRes.arrayBuffer());

  const isText =
    contentType.includes("text/html") ||
    contentType.includes("javascript") ||
    contentType.includes("text/css") ||
    contentType.includes("application/json");

  if (isText) {
    const text = buf.toString("utf-8");
    const isHtml = contentType.includes("text/html");
    const rewritten = rewriteBody(text, toolOrigin, proxyBase, isHtml);
    res.send(rewritten);
  } else {
    res.send(buf);
  }
};

// Mount — handle root and all sub-paths
router.use("/proxy/:productId", proxyHandler);

export default router;
