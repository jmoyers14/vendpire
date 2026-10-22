/**
 * Compile-time proof that an output schema still matches its entity.
 *
 * Usage, one line under each schema:
 *
 *   export type LocationDtoMatches = Assert<Equal<z.infer<typeof locationDto>, Location>>;
 *
 * It fires as `Type 'false' does not satisfy the constraint 'true'`. Fix the
 * schema or the entity — never weaken the assertion to make the build pass.
 */

/** Fails to compile unless `T` is exactly `true`. Mirrors VisitRepository/types.ts:57. */
export type Assert<T extends true> = T;

/**
 * Equality in BOTH directions. `z.ZodType<Dto>` only checks assignability, so it
 * accepts a schema that is too narrow — a stale extra field, or a missing union
 * arm. Both reach Swift as a contract that lies.
 */
export type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <
  G,
>() => G extends B ? 1 : 2
  ? true
  : false;
