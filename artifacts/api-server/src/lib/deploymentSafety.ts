import type { RequestHandler } from "express";
import {
  PROTECTED_DATASETS,
  getDatasetDefinition,
  isDatasetUnlocked,
  listDatasetStatuses,
  recordDatasetEvent,
  type DatasetStatus,
} from "./protectedData";
import { logger } from "./logger";

/**
 * Registry of risky/bulk/import-style admin operations. This app has no
 * hook into Replit's own Git/deploy pipeline (no staging tier, no OS-level
 * git hooks), so "safety before deploy" is scoped to what this app actually
 * controls: bulk or import-style writes against protected business data.
 * New risky endpoints (import tools, restore flows, etc. from later Phase 3
 * tasks) register themselves here and get gating for free via
 * requireOperationClearance below.
 */
export interface RiskyOperationDefinition {
  key: string;
  label: string;
  description: string;
  datasetKeys: string[];
}

export const RISKY_OPERATIONS: RiskyOperationDefinition[] = [
  {
    key: "bulk_update_products",
    label: "Bulk update products",
    description: "Changing price, visibility, or other fields on many products at once.",
    datasetKeys: ["products"],
  },
  {
    key: "import_products",
    label: "Import products",
    description: "Creating or overwriting product records from an external file/feed.",
    datasetKeys: ["products"],
  },
  {
    key: "bulk_update_users",
    label: "Bulk update users",
    description: "Changing access, entitlements, or device sessions for many customers at once.",
    datasetKeys: ["users"],
  },
  {
    key: "restore_products",
    label: "Restore products from backup",
    description: "Overwriting current product records with a prior backup snapshot.",
    datasetKeys: ["products"],
  },
  {
    key: "restore_orders",
    label: "Restore orders from backup",
    description: "Overwriting current order/purchase records with a prior backup snapshot.",
    datasetKeys: ["orders_purchases", "payment_history"],
  },
  {
    key: "restore_users",
    label: "Restore users from backup",
    description: "Overwriting current customer accounts with a prior backup snapshot.",
    datasetKeys: ["users"],
  },
  {
    key: "restore_subscriptions",
    label: "Restore subscriptions from backup",
    description: "Overwriting current subscription/entitlement records with a prior backup snapshot.",
    datasetKeys: ["subscriptions"],
  },
  {
    key: "reset_website_settings",
    label: "Reset website settings",
    description: "Reverting homepage, feature-flag, or site-wide settings to defaults.",
    datasetKeys: ["website_settings"],
  },
];

const definitionsByKey = new Map(RISKY_OPERATIONS.map((d) => [d.key, d]));

export function getRiskyOperationDefinition(key: string): RiskyOperationDefinition | undefined {
  return definitionsByKey.get(key);
}

export interface OperationRiskAssessment {
  key: string;
  label: string;
  description: string;
  affectedDatasets: DatasetStatus[];
  allUnlocked: boolean;
}

/**
 * Given an operation key, resolves which protected datasets (Task 1's
 * registry) it would touch, and whether every one of them is currently
 * unlocked. This is the read-only "what will this affect?" check the
 * Deployment Safety UI shows the admin before they confirm a risky action.
 */
export async function assessOperationRisk(key: string): Promise<OperationRiskAssessment> {
  const def = getRiskyOperationDefinition(key);
  if (!def) throw new Error(`Unknown risky operation: ${key}`);
  const statuses = await listDatasetStatuses();
  const byKey = new Map(statuses.map((s) => [s.key, s]));
  const affectedDatasets = def.datasetKeys
    .map((k) => byKey.get(k))
    .filter((s): s is DatasetStatus => !!s);
  return {
    key: def.key,
    label: def.label,
    description: def.description,
    affectedDatasets,
    allUnlocked: affectedDatasets.every((d) => !d.locked),
  };
}

export async function listAllRiskAssessments(): Promise<OperationRiskAssessment[]> {
  return Promise.all(RISKY_OPERATIONS.map((d) => assessOperationRisk(d.key)));
}

/**
 * Reusable gate for any admin route that performs a risky bulk/import-style
 * write. Blocks (423) unless every protected dataset the operation touches
 * is currently unlocked, and logs the outcome (allowed or blocked) against
 * each affected dataset in the same audit trail Task 1's Protected Data
 * centre uses. Ready for the Restore/Recovery/Backup tasks to wrap their
 * endpoints in once those exist — see RISKY_OPERATIONS above to register a
 * new operation.
 */
export function requireOperationClearance(operationKey: string): RequestHandler {
  return async (req, res, next) => {
    try {
      const def = getRiskyOperationDefinition(operationKey);
      if (!def) {
        res.status(500).json({ error: `Unknown risky operation: ${operationKey}` });
        return;
      }
      const lockedKeys: string[] = [];
      for (const datasetKey of def.datasetKeys) {
        if (!(await isDatasetUnlocked(datasetKey))) lockedKeys.push(datasetKey);
      }
      if (lockedKeys.length > 0) {
        for (const datasetKey of def.datasetKeys) {
          await recordDatasetEvent({ datasetKey, action: "blocked_attempt", actor: req.staffUser, ipAddress: req.ip, reason: `Blocked risky operation: ${def.label}` });
        }
        const labels = lockedKeys.map((k) => getDatasetDefinition(k)?.label ?? k).join(", ");
        res.status(423).json({
          error: `"${def.label}" touches protected data (${labels}) that is still locked. Unlock it from the Protected Data centre first.`,
          lockedDatasets: lockedKeys,
        });
        return;
      }
      for (const datasetKey of def.datasetKeys) {
        await recordDatasetEvent({ datasetKey, action: "allowed_attempt", actor: req.staffUser, ipAddress: req.ip, reason: `Allowed risky operation: ${def.label}` });
      }
      next();
    } catch (err) {
      logger.error({ err, operationKey }, "Failed to evaluate deployment-safety clearance");
      res.status(500).json({ error: "Failed to check deployment safety clearance." });
    }
  };
}

export type Environment = "development" | "production";

export function getEnvironment(): Environment {
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export interface DeploymentSafetySummary {
  environment: Environment;
  protectedDatasets: DatasetStatus[];
  riskyOperations: OperationRiskAssessment[];
  explanation: string;
}

const EXPLANATION =
  "This app has no hook into Replit's own Git or deployment pipeline — production schema and code changes are " +
  "applied through Replit's own Publish flow, not from inside this admin panel. What this centre protects instead " +
  "is in-app data operations: bulk product/user updates, imports, and future restore actions that write to the " +
  "same business-critical datasets tracked in the Protected Data centre. Every such action is blocked unless the " +
  "datasets it touches are explicitly unlocked first, and every attempt (allowed or blocked) is logged below.";

export async function getDeploymentSafetySummary(): Promise<DeploymentSafetySummary> {
  const [protectedDatasets, riskyOperations] = await Promise.all([listDatasetStatuses(), listAllRiskAssessments()]);
  return {
    environment: getEnvironment(),
    protectedDatasets,
    riskyOperations,
    explanation: EXPLANATION,
  };
}

export { PROTECTED_DATASETS };
