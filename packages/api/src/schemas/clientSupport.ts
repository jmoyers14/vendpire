import { z } from "zod";
import type { UpdateRequirement } from "../services/MobileClientSupportService/MobileClientSupportService.ts";
import type { Assert, Equal } from "./exactly.ts";

/**
 * What `GET /api/v1/client-support` returns — the only unauthenticated endpoint
 * on the surface. A client old enough to be walled is likely also holding an
 * expired session, so a wall that needs a valid token is a wall that never
 * appears.
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
