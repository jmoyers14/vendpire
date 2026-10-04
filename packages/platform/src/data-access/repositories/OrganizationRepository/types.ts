/**
 * A local mirror of the Clerk organization — the business. Plain data, free of
 * Mongoose types.
 */
export interface Organization {
  id: string;
  /**
   * The Clerk org id, which IS the app's tenant key — the same string every
   * other collection carries as `orgId`.
   */
  orgId: string;
  name: string;
  slug: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fields carried by an organization sync. `orgId` is included because it's the
 * key the upsert matches on, not a server-managed value.
 */
export type OrganizationInput = Omit<
  Organization,
  "id" | "createdAt" | "updatedAt"
>;
