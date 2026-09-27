export type Environment = "local" | "staging" | "production";

/**
 * Process-wide identity: which environment this is, and exactly which build is
 * running. The build stamp is injected into the image at build time by
 * deploy.sh, so the version a user reads off the app traces to one commit.
 *
 * Kept free of the zod loader (see loadAppConfig.ts) because this type rides on
 * the tRPC Context and must stay resolvable by the web client without dragging
 * env-parsing code into its compile.
 */
export interface AppConfig {
  environment: Environment;
  /** Human-facing app version from the root package.json (e.g. "1.0.0"). */
  version: string;
  /** Short git SHA of the built commit ("-dirty" suffixed if the tree wasn't clean). */
  commit: string;
  /** ISO-8601 UTC timestamp of when the image was built. */
  builtAt: string;
}

export const APP_CONFIG_TOKEN = "AppConfig";
