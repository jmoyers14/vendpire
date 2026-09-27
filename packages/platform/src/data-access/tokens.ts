/**
 * Dependency-injection tokens for repositories. Kept in their own side-effect-
 * free module (mirroring services/tokens.ts in the api package) so consumers can
 * import a token without triggering DI registration or pulling Mongoose into
 * their compile. Empty until Phase 3 adds the first entity slices.
 */
export {};
