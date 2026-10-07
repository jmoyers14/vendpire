import type { Location, LocationInput } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for locations. Every method is org-scoped so the tenant
 * boundary is enforced at the data layer. Deletes are soft (deletedAt) so they
 * propagate to offline devices at sync; reads exclude soft-deleted docs.
 */
export interface LocationRepository {
  findByOrg(orgId: string): Promise<Location[]>;
  findById(orgId: string, id: string): Promise<Location | null>;
  findByIdIncludingDeleted(orgId: string, id: string): Promise<Location | null>;
  create(orgId: string, data: LocationInput): Promise<Location>;
  update(orgId: string, id: string, data: LocationInput): Promise<Location | null>;
  softDelete(orgId: string, id: string): Promise<void>;
}
