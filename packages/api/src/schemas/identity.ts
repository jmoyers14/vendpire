import { z } from "zod";
import type { AuthIdentity } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

/**
 * What `GET /api/v1/me` returns.
 *
 * `orgId` is NULLABLE and that is load-bearing: it is how a user with no
 * active organization discovers why they are stuck. The procedure behind this
 * is `protectedProcedure`, never `orgProtectedProcedure` — under an org gate
 * the call returns 403 with no way to tell "no org" from "no access".
 */
export const identityDto = z
  .object({
    userId: z.string(),
    orgId: z.string().nullable(),
    orgRole: z.string().nullable(),
    orgSlug: z.string().nullable(),
  })
  .meta({ id: "Identity" });

export type IdentityDtoMatches = Assert<
  Equal<z.infer<typeof identityDto>, AuthIdentity>
>;
