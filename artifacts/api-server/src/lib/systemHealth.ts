import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getPaymentHealth } from "./paymentHealth";
import { getAiHealth } from "./aiHealth";
import { getEmailHealth } from "./emailHealth";
import { getAuthHealth } from "./authHealth";
import { getStorageHealth } from "./storageAdmin";
import { getEnvironmentInfo, type EnvironmentInfo } from "./environment";

export type ServiceStatus = "healthy" | "warning" | "error";

export interface ServiceHealth {
  key: string;
  label: string;
  status: ServiceStatus;
  summary: string;
}

export interface SystemHealthReport {
  status: ServiceStatus;
  services: ServiceHealth[];
  checkedAt: string;
  environment: EnvironmentInfo;
}

async function getDatabaseHealth(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await db.execute(sql`select 1`);
    const ms = Date.now() - start;
    return {
      key: "database",
      label: "Database",
      status: ms > 1000 ? "warning" : "healthy",
      summary: ms > 1000 ? `Reachable but slow (${ms}ms).` : `Reachable (${ms}ms).`,
    };
  } catch (err) {
    return {
      key: "database",
      label: "Database",
      status: "error",
      summary: err instanceof Error ? err.message : "Could not reach the database.",
    };
  }
}

function getServerHealth(): ServiceHealth {
  const uptimeSec = Math.round(process.uptime());
  const mem = process.memoryUsage();
  const usedMb = Math.round(mem.rss / (1024 * 1024));
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  return {
    key: "server",
    label: "Server",
    status: "healthy",
    summary: `Up ${hours}h ${minutes}m, using ${usedMb}MB (Node ${process.version}).`,
  };
}

/**
 * Aggregates every service the Emergency Recovery / System Health Dashboard
 * cares about into one report. Every underlying check is read-only — this
 * never touches products, users, orders, subscriptions, or any other
 * business-data table, only configuration/credential/connectivity state.
 */
export async function getSystemHealth(): Promise<SystemHealthReport> {
  const [database, payment, ai, email, auth, storage] = await Promise.all([
    getDatabaseHealth(),
    getPaymentHealth().then(
      (h): ServiceHealth => ({
        key: "payment",
        label: "Payment Gateway",
        status: h.status === "healthy" ? "healthy" : h.status,
        summary: h.checks.find((c) => c.key === "api")?.message ?? "See Payment Management for details.",
      }),
    ),
    getAiHealth().then(
      (h): ServiceHealth => ({
        key: "ai",
        label: "AI Services",
        status: h.status,
        summary: h.checks.find((c) => c.key === "availability")?.message ?? "See AI Configuration for details.",
      }),
    ),
    getEmailHealth().then(
      (h): ServiceHealth => ({
        key: "email",
        label: "Email Service",
        status: h.status,
        summary: h.checks.find((c) => c.key === "connectivity")?.message ?? "See Email Configuration for details.",
      }),
    ),
    getAuthHealth().then(
      (h): ServiceHealth => ({
        key: "authentication",
        label: "Authentication",
        status: h.status,
        summary: h.checks.find((c) => c.key === "clerk_connectivity")?.message ?? "See Authentication Manager for details.",
      }),
    ),
    getStorageHealth(),
  ]);
  const server = getServerHealth();

  const services = [database, payment, ai, email, auth, storage, server];
  const status: ServiceStatus = services.some((s) => s.status === "error")
    ? "error"
    : services.some((s) => s.status === "warning")
      ? "warning"
      : "healthy";

  return { status, services, checkedAt: new Date().toISOString(), environment: getEnvironmentInfo() };
}
