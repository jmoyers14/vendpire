import { z } from "zod";
import type { AppConfig } from "./appConfig.ts";
import { parseConfig } from "./parseConfig.ts";

const schema = z.object({
  environment: z.enum(["local", "staging", "production"]).default("local"),
  version: z.string().default("0.0.0"),
  commit: z.string().default("unknown"),
  builtAt: z.string().default("unknown"),
});

export function loadAppConfig(): AppConfig {
  return parseConfig("app", schema, {
    environment: process.env.ENVIRONMENT,
    version: process.env.APP_VERSION,
    commit: process.env.GIT_SHA,
    builtAt: process.env.BUILT_AT,
  });
}
