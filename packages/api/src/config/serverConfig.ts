import { z } from "zod";
import { parseConfig } from "@vendpire/platform/server";

export interface ServerConfig {
  port: number;
  webUrl: string;
}

export const SERVER_CONFIG_TOKEN = "ServerConfig";

const schema = z.object({
  port: z.coerce.number().default(3000),
  webUrl: z.string().url().default("http://localhost:5173"),
});

export function loadServerConfig(): ServerConfig {
  return parseConfig("server", schema, {
    port: process.env.PORT,
    webUrl: process.env.WEB_URL,
  });
}
