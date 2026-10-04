import type { User, UserInput } from "./types.ts";

export * from "./types.ts";

/**
 * Persistence boundary for the local user mirror. Not org-scoped: a user is an
 * identity, and the same person can belong to several organizations.
 */
export interface UserRepository {
  /**
   * Creates or updates the mirror for one provider user. An upsert rather than
   * create/update because `user.created` and `user.updated` can arrive out of
   * order, or be redelivered — sync has to converge on the same result either
   * way, from any starting state.
   */
  upsertByAuthId(input: UserInput): Promise<User>;
  findByAuthId(authUserId: string): Promise<User | null>;
  deleteByAuthId(authUserId: string): Promise<void>;
}
