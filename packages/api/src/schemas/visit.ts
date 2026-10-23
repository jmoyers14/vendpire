import { z } from "zod";
import type { Visit } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

/** Mirrors `RemovalReason` (domain/src/visits/removals.ts). All five arms. */
const removalReason = z.enum([
  "expired",
  "damaged",
  "recalled",
  "destocked",
  "transferred",
]);

export const visitDto = z
  .object({
    id: z.string(),
    machineId: z.string(),
    /** Snapshot from the client — where the machine stood when counted. */
    locationId: z.string(),
    planogramId: z.string().nullable(),
    /** When you stood at the machine. The ordering key for everything. */
    countedAt: z.string().meta({ format: "date-time" }),
    recordedByUserId: z.string(),
    lines: z.array(
      z.object({
        slotCode: z.string(),
        productId: z.string(),
        /** What was in the slot on arrival, BEFORE refilling and removing. */
        remaining: z
          .number()
          .int()
          .describe(
            "What was physically in the slot on arrival, before refilling and before removing anything — every derived number is silently wrong if a post-fill count is recorded here.",
          ),
        added: z.number().int(),
        removed: z.number().int(),
        removedReason: removalReason
          .nullable()
          .describe(
            "Required when removed > 0; decides whether the removed units are a write-off or a transfer.",
          ),
        /** Snapshotted, so a later planogram edit cannot rewrite past revenue. */
        priceCents: z
          .number()
          .int()
          .describe(
            "Snapshotted, so a later planogram edit cannot rewrite past revenue.",
          ),
        par: z
          .number()
          .int()
          .nullable()
          .describe("Fill target in effect at this servicing; never used in the P&L."),
        /** The front unit's date, "YYYY-MM-DD". */
        bestBy: z
          .string()
          .nullable()
          .describe("The front unit's expiration date, as a zoneless \"YYYY-MM-DD\" string."),
      }),
    ),
    notes: z.string().nullable(),
    clientRequestId: z.string(),
    createdAt: z.string().meta({ format: "date-time" }),
    updatedAt: z.string().meta({ format: "date-time" }),
  })
  .meta({ id: "Visit" });

export type VisitDtoMatches = Assert<Equal<z.infer<typeof visitDto>, Visit>>;
