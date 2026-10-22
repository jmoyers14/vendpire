/**
 * Compile-time proof that an output schema and its DTO type are the same shape.
 *
 * A plain `const dto: z.ZodType<Dto>` annotation catches a field ADDED to the
 * entity and a field whose type CHANGED — but not a stale field left behind in
 * the schema, because extra properties stay structurally assignable through a
 * generic. That direction is the damaging one: `.output()` strips the field at
 * runtime while the generated spec still advertises it as required, so the
 * phone decodes a required property that never arrives.
 *
 * Usage, one line under each schema:
 *
 *   export type LocationDtoMatches = Assert<Equal<z.infer<typeof locationDto>, LocationDto>>;
 *
 * When it fires the error is `Type 'false' does not satisfy the constraint
 * 'true'` on that line. It means the schema and the entity have drifted — fix
 * whichever one is wrong. Do NOT weaken the assertion to make the build pass;
 * catching this is the entire point of declaring the schemas.
 */

/** Fails to compile unless `T` is exactly `true`. Mirrors VisitRepository/types.ts:57. */
export type Assert<T extends true> = T;

/**
 * Structural equality in BOTH directions. The identical-function-signature
 * trick is what makes it bidirectional; a bare conditional would accept a
 * schema with extra properties.
 */
export type Equal<A, B> = (<G>() => G extends A ? 1 : 2) extends <
  G,
>() => G extends B ? 1 : 2
  ? true
  : false;
