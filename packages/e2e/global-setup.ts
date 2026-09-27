import { clerkSetup } from "@clerk/testing/playwright";

/**
 * Fetches a Clerk Testing Token once per run so browser tests bypass bot
 * detection. Skipped when no keys are configured — the api-only specs still
 * run; browser specs skip themselves (see fixtures.ts).
 */
export default async function globalSetup(): Promise<void> {
  if (!process.env.CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    return;
  }
  await clerkSetup({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  });
}
