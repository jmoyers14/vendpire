import { z } from "zod";
import type { Machine } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

export const machineDto = z
  .object({
    id: z.string(),
    locationId: z.string(),
    name: z.string(),
    kind: z.enum(["snack", "drink", "combo"]),
    make: z.string().nullable(),
    model: z.string().nullable(),
    serial: z.string().nullable(),
    tagCode: z.string().nullable(),
    templateId: z.string().nullable(),
    /** One array per shelf, slot codes in walking order. */
    slots: z.array(z.array(z.string())),
    cardReader: z
      .object({
        provider: z.enum(["nayax", "cantaloupe"]),
        deviceId: z.string(),
      })
      .nullable(),
    active: z.boolean(),
    createdAt: z.string().meta({ format: "date-time" }),
    updatedAt: z.string().meta({ format: "date-time" }),
  })
  .meta({ id: "Machine" });

export type MachineDtoMatches = Assert<
  Equal<z.infer<typeof machineDto>, Machine>
>;
