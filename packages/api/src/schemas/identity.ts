import { z } from "zod";
import type { AuthIdentity } from "@vendpire/platform";
import type { Assert, Equal } from "./exactly.ts";

/**
 * A null `orgId` is how a member-less user learns why they are stuck, so the
 * procedure stays `protectedProcedure` — an org gate would 403 with no way to
 * tell "no org" from "no access".
 */
export const identityDto = z
  .object({
    userId: z.string(),
    orgId: z
      .string()
      .nullable()
      .describe(
        "Null means no active org — how a member-less user discovers why they are stuck.",
      ),
    orgRole: z.string().nullable(),
    orgSlug: z.string().nullable(),
  })
  .meta({ id: "Identity" });

export type IdentityDtoMatches = Assert<
  Equal<z.infer<typeof identityDto>, AuthIdentity>
>;
