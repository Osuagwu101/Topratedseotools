/**
 * Shared server-side "master session" cache used by the reverse proxy and by
 * the admin one-click-auth activation flow. Kept in one place so admin
 * activation/reset and the proxy's own session refresh never drift.
 */

import { db, toolServersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { decryptServerCredentials } from "./toolCredentials";

// ── Single device fingerprint — shared across proxy + admin login capture ───
export const DEVICE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export interface ToolSession {
  cookie: string;
  authHeader: string;
  expiresAt: number;
}

// Keyed by tool_servers.id
const sessions = new Map<number, ToolSession>();

export async function loginToTool(
  serverRow: typeof toolServersTable.$inferSelect,
): Promise<ToolSession | null> {
  const server = decryptServerCredentials(serverRow);
  if (!server.loginUrl || !server.username || !server.password) return null;

  let toolOrigin: string;
  try {
    toolOrigin = new URL(server.loginUrl).origin;
  } catch {
    return null;
  }

  const body = JSON.stringify({
    [server.usernameField ?? "email"]: server.username,
    [server.passwordField ?? "password"]: server.password,
  });

  const loginRes = await fetch(server.loginUrl, {
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

  const rawCookies: string[] =
    typeof (loginRes.headers as any).getSetCookie === "function"
      ? (loginRes.headers as any).getSetCookie()
      : [];
  const cookie = rawCookies.map((c: string) => c.split(";")[0]).join("; ");

  let authHeader = "";
  try {
    const json = (await loginRes.clone().json()) as {
      token?: string;
      access_token?: string;
      jwt?: string;
      data?: { token?: string; access_token?: string };
    };
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

export async function getSession(
  server: typeof toolServersTable.$inferSelect,
): Promise<ToolSession | null> {
  const cached = sessions.get(server.id);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const session = await loginToTool(server);
  if (session) sessions.set(server.id, session);
  return session;
}

export function setSession(serverId: number, session: ToolSession): void {
  sessions.set(serverId, session);
}

export function invalidateSession(serverId: number): void {
  sessions.delete(serverId);
}

// Used by the admin reset flow: clears any cached master session for every
// auto-login server configured under a product, forcing a fresh login the
// next time the proxy (or the activation endpoint) needs a session.
export async function invalidateSessionsForProduct(productId: number): Promise<void> {
  const servers = await db
    .select({ id: toolServersTable.id })
    .from(toolServersTable)
    .where(and(eq(toolServersTable.productId, productId), eq(toolServersTable.isAutoLogin, true)));
  for (const s of servers) sessions.delete(s.id);
}
