import { z } from "zod";
import type { UpdateRequirement } from "../services/MobileClientSupportService/MobileClientSupportService.ts";
import type { Assert, Equal } from "./exactly.ts";

/**
 * The only unauthenticated endpoint on the surface: a build old enough to be
 * walled is likely also holding an expired session.
 */
export const clientSupportDto = z
  .object({
    updateRequirement: z.enum(["none", "recommended", "required"]),
    updateUrl: z.string(),
  })
  .meta({ id: "ClientSupport" });

type ClientSupportShape = {
  updateRequirement: UpdateRequirement;
  updateUrl: string;
};

export type ClientSupportDtoMatches = Assert<
  Equal<z.infer<typeof clientSupportDto>, ClientSupportShape>
>;
