import { z } from "zod";
import type { Visit } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

/**
 * The five reasons a unit leaves a machine without being sold. Mirrors
 * `RemovalReason` at packages/domain/src/visits/removals.ts — kept as a
 * literal enum here (rather than importing the domain type) because this is
 * an output schema, and `transferred` must stay even though the task brief
 * that described this file omitted it; the Assert below is what caught that.
 */
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
        remaining: z.number(),
        added: z.number(),
        removed: z.number(),
        removedReason: removalReason.nullable(),
        /** Snapshotted, so a later planogram edit cannot rewrite past revenue. */
        priceCents: z.number(),
        par: z.number().nullable(),
        /** The front unit's date, "YYYY-MM-DD". */
        bestBy: z.string().nullable(),
      }),
    ),
    notes: z.string().nullable(),
    clientRequestId: z.string(),
    createdAt: z.string().meta({ format: "date-time" }),
    updatedAt: z.string().meta({ format: "date-time" }),
  })
  .meta({ id: "Visit" });

export type VisitDtoMatches = Assert<Equal<z.infer<typeof visitDto>, Visit>>;
