import { z } from "zod";
import { parseConfig } from "../../config/parseConfig.ts";

export interface ClerkConfig {
  secretKey: string;
}

export const CLERK_CONFIG_TOKEN = "ClerkConfig";

const schema = z.object({
  secretKey: z.string().min(1),
});

export function loadClerkConfig(): ClerkConfig {
  return parseConfig("Clerk", schema, {
    secretKey: process.env.CLERK_SECRET_KEY,
  });
}
