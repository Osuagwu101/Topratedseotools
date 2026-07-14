import { logger } from "./lib/logger";
import { validateStartupSecrets } from "./lib/startupValidation";
import { hydrateProcessEnvFromConfig } from "./lib/systemConfig";
import { bootstrapSuperAdminIfNeeded } from "./lib/staffAuth";
import { migrateLegacyToolCredentials } from "./lib/toolCredentials";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Fail fast on missing load-bearing secrets, then let any System
// Configuration Centre overrides win over the raw environment, then ensure
// a real Super Admin account exists — all before accepting traffic.
validateStartupSecrets();

async function boot(): Promise<void> {
  await hydrateProcessEnvFromConfig();
  await bootstrapSuperAdminIfNeeded();
  await migrateLegacyToolCredentials();

  // `./app` (and everything it statically imports — routes, middlewares,
  // etc.) is only loaded now, after hydration has finished mirroring any
  // System Configuration Centre overrides into process.env. Importing it
  // eagerly at the top of this file would run that whole module graph
  // before hydration ran, which matters for any module that reads an env
  // var once at construction time rather than per-request.
  const { default: app } = await import("./app");

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

boot().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
