/**
 * A local mirror of a provider-held user. Plain data, free of Mongoose types.
 * Every field but the id is nullable because the provider itself treats them as
 * optional — a user can exist with no name and no avatar.
 */
export interface User {
  id: string;
  /** The provider's user id. Vendor-neutral name, matching the AuthClient port. */
  authUserId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fields carried by a user sync. `authUserId` is included because it's the key
 * the upsert matches on, not a server-managed value.
 */
export type UserInput = Omit<User, "id" | "createdAt" | "updatedAt">;
