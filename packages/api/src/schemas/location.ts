import { z } from "zod";
import type { Location } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

/**
 * Kept despite being the one union that puts a `oneOf` in the document:
 * `.output()` strips at runtime for every caller, and `locations.list` is
 * shared with the dashboard, which needs it. The phone ignores it.
 */
const locationCommission = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("none") }),
    z.object({
      type: z.literal("percent"),
      percentBps: z.number(),
      basis: z.enum(["gross", "net"]),
    }),
    z.object({ type: z.literal("flat"), flatCents: z.number() }),
  ])
  .meta({ id: "LocationCommission" });

export const locationDto = z
  .object({
    id: z.string(),
    name: z.string(),
    address: z.object({
      line1: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      zip: z.string().nullable(),
      geo: z
        .object({ lat: z.number(), lng: z.number() })
        .nullable()
        .describe("From the Places resolve."),
    }),
    contact: z.object({
      name: z.string().nullable(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
    }),
    commission: locationCommission,
    notes: z.string().nullable(),
    active: z.boolean(),
    createdAt: z.string().meta({ format: "date-time" }),
    updatedAt: z.string().meta({ format: "date-time" }),
  })
  .meta({ id: "Location" });

export type LocationDtoMatches = Assert<
  Equal<z.infer<typeof locationDto>, Location>
>;
