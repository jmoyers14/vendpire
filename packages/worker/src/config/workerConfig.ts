import { z } from "zod";
import { parseConfig } from "@vendpire/platform/server";

/**
 * The worker's own HTTP-server slice. Deliberately narrower than the api's
 * ServerConfig: the worker has no browser origin to trust (its callers are
 * Clerk's webhook sender and Cloud Tasks), so there's no CORS/webUrl here.
 */
export interface WorkerConfig {
  port: number;
}

export const WORKER_CONFIG_TOKEN = "WorkerConfig";

const schema = z.object({
  // 3211 rather than 3210, which the api holds locally.
  port: z.coerce.number().default(3211),
});

export function loadWorkerConfig(): WorkerConfig {
  return parseConfig("worker", schema, {
    port: process.env.PORT,
  });
}
