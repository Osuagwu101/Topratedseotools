// Tiny standalone module (no other lib/ imports) so both backupEngine.ts and
// deploymentSafety.ts can read the current environment without creating an
// import cycle between them.
export type Environment = "development" | "production";

export function getEnvironment(): Environment {
  return process.env.NODE_ENV === "production" ? "production" : "development";
}
