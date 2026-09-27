import type { z, ZodTypeAny } from "zod";
import { rootLogger } from "../logging/pinoLogger.ts";

/**
 * Parse + validate one config slice from raw env. On failure, logs the offending
 * fields and exits — a misconfigured process should fail loudly at the moment it
 * first needs the slice, not limp along. Each slice validates independently, so
 * an entrypoint only pays for the env it actually reads.
 */
export function parseConfig<S extends ZodTypeAny>(
  label: string,
  schema: S,
  raw: unknown,
): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    rootLogger.error(
      {
        config: label,
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      `invalid ${label} configuration`,
    );
    process.exit(1);
  }
  return result.data;
}
