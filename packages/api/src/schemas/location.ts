import { z } from "zod";
import type { Location } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

/**
 * What `GET /api/v1/locations` returns: the Location entity, exactly, like the
 * other eight schemas in this directory.
 *
 * `commission` stays even though it's a 3-arm discriminated union — the only
 * union in the entity layer, and the one shape that pushes a `oneOf` into the
 * generated document. `locations.list` is shared with the web dashboard, and
 * `.output()` applies to the procedure, not the transport: it strips any key
 * not in the schema AT RUNTIME, for every caller. Trimming `commission` here
 * to spare the phone a `oneOf` would silently trim it from the dashboard's
 * response too. The dashboard needs it, so it stays, and the phone just
 * ignores the `oneOf` it doesn't use.
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
      geo: z.object({ lat: z.number(), lng: z.number() }).nullable(),
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
