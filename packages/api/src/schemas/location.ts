import { z } from "zod";
import type { Location } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

/**
 * What `GET /api/v1/locations` returns: the Location entity minus `commission`.
 *
 * `commission` is a 3-arm discriminated union and the only union in the entity
 * layer. It is cut from v1 — the phone has no use for it — which keeps a
 * `oneOf` out of the generated document, the shape swift-openapi-generator
 * fights hardest with. Declaring the omission as a type (rather than leaving
 * the schema un-annotated) keeps it an explicit decision.
 */
export type LocationDto = Omit<Location, "commission">;

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
    notes: z.string().nullable(),
    active: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "Location" });

export type LocationDtoMatches = Assert<
  Equal<z.infer<typeof locationDto>, LocationDto>
>;
