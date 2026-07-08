/**
 * Reverse proxy for auto-login tools (Phrasly, StealthWriter, etc.)
 *
 * All traffic flows through this server so the target tool always sees:
 *  - Our server's single fixed IP address
 *  - One fixed User-Agent (simulating a single device)
 *
 * Flow:
 *  1. User (authenticated + active sub) hits /api/proxy/:productId/*
 *  2. Server checks/refreshes a server-side session for that tool
 *  3. Every request is forwarded from our server with the cached session
 *  4. HTML + JS responses are rewritten so all links go back through our proxy
 */

import { Router, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { db, ordersTable, toolCredentialsTable, productsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router = Router();

// ── Single device fingerprint ────────────────────────────────────────────────
const DEVICE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// ── Server-side session cache ────────────────────────────────────────────────
interface ToolSession {
  cookie: string;
  authHeader: string;
  expiresAt: number;
}

const sessions = new Map<number, ToolSession>();

async function loginToTool(productId: number): Promise<ToolSession | null> {
  const [cred] = await db
    .select()
    .from(toolCredentialsTable)
    .where(eq(toolCredentialsTable.productId, productId));

  if (!cred?.loginUrl || !cred.username || !cred.password) return null;

  let toolOrigin: string;
  try {
    toolOrigin = new URL(cred.loginUrl).origin;
  } catch {
    return null;
  }

  const body = JSON.stringify({
    [cred.usernameField ?? "email"]: cred.username,
    [cred.passwordField ?? "password"]: cred.password,
  });

  const loginRes = await fetch(cred.loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": DEVICE_UA,
      Accept: "application/json, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Origin: toolOrigin,
      Referer: toolOrigin + "/",
    },
    body,
    redirect: "manual",
  });

  // Capture cookies (session-based auth)
  const rawCookies: string[] =
    typeof (loginRes.headers as any).getSetCookie === "function"
      ? (loginRes.headers as any).getSetCookie()
      : [];
  const cookie = rawCookies.map((c: string) => c.split(";")[0]).join("; ");

  // Capture bearer token (JWT-based auth)
  let authHeader = "";
  try {
    const json = await loginRes.clone().json();
    const token =
      json.token ??
      json.access_token ??
      json.jwt ??
      json.data?.token ??
      json.data?.access_token ??
      "";
    if (token) authHeader = `Bearer ${token}`;
  } catch {
    // response may not be JSON (form-based login returns HTML redirect)
  }

  return { cookie, authHeader, expiresAt: Date.now() + 25 * 60 * 1000 };
}

async function getSession(productId: number): Promise<ToolSession | null> {
  const cached = sessions.get(productId);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const session = await loginToTool(productId);
  if (session) sessions.set(productId, session);
  return session;
}

// Invalidate cached session (called when we detect auth failure)
function invalidateSession(productId: number): void {
  sessions.delete(productId);
}

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

// ── Auth + subscription guard ────────────────────────────────────────────────
async function checkAccess(
  userId: string,
  productId: number,
): Promise<boolean> {
  const [order] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.clerkUserId, userId),
        eq(ordersTable.productId, productId),
        eq(ordersTable.status, "success"),
      ),
    );
  return !!order;
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

  // Subscription check
  const hasAccess = await checkAccess(auth.userId, productId);
  if (!hasAccess) {
    res.status(403).send("No active subscription for this tool.");
    return;
  }

  // Look up credential config
  const [cred] = await db
    .select()
    .from(toolCredentialsTable)
    .where(
      and(
        eq(toolCredentialsTable.productId, productId),
        eq(toolCredentialsTable.isAutoLogin, true),
      ),
    );

  if (!cred?.loginUrl) {
    res.status(503).send("Tool not configured for proxy login. Contact admin.");
    return;
  }

  let toolOrigin: string;
  try {
    toolOrigin = new URL(cred.loginUrl).origin;
  } catch {
    res.status(503).send("Invalid tool login URL configured.");
    return;
  }

  // Get (or refresh) server-side session
  let session = await getSession(productId);
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

  let reqBody: BodyInit | undefined;
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
    invalidateSession(productId);
    session = await getSession(productId);
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
  if (newCookies.length > 0) {
    const merged = newCookies.map((c: string) => c.split(";")[0]).join("; ");
    const existing = sessions.get(productId);
    if (existing) {
      existing.cookie = merged;
    }
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
