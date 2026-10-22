import { z } from "zod";
import type { Planogram } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

export const planogramDto = z
  .object({
    id: z.string(),
    machineId: z.string(),
    effectiveFrom: z.string(),
    slots: z.array(
      z.object({
        slotCode: z.string(),
        productId: z.string(),
        /** Units the slot holds when full — the refill target. */
        par: z.number(),
        priceCents: z.number(),
      }),
    ),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "Planogram" });

export type PlanogramDtoMatches = Assert<
  Equal<z.infer<typeof planogramDto>, Planogram>
>;
