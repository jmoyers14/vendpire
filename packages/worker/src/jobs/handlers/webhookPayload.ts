import { z } from "zod";

/**
 * Every webhook-derived job stores its event pointer as the payload; the handler
 * resolves the raw event itself, which keeps the runner job-type agnostic and
 * keeps the queue free of anything database-shaped.
 */
export const webhookPayloadSchema = z.object({
  source: z.enum(["clerk"]),
  sourceEventId: z.string().min(1),
});
