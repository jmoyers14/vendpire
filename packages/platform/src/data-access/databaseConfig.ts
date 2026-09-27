import { z } from "zod";
import { parseConfig } from "../config/parseConfig.ts";

export interface DatabaseConfig {
  uri: string;
}

export const DATABASE_CONFIG_TOKEN = "DatabaseConfig";

const schema = z.object({
  uri: z.string().min(1),
});

export function loadDatabaseConfig(): DatabaseConfig {
  return parseConfig("database", schema, {
    uri: process.env.MONGODB_URI,
  });
}
