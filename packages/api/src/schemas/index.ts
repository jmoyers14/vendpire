/**
 * Output schemas for the `/api/v1` surface. One per entity, each annotated
 * against its entity type so a change to the entity is a TypeScript error
 * rather than silent spec drift, and each carrying `.meta({ id })` so the
 * generated document emits a named component instead of an inline copy.
 */
export { locationDto } from "./location.ts";
export { machineDto } from "./machine.ts";
export { productDto } from "./product.ts";
export { packDto } from "./pack.ts";
export { planogramDto } from "./planogram.ts";
export { visitDto } from "./visit.ts";
export { purchaseDto } from "./purchase.ts";
export { identityDto } from "./identity.ts";
export { clientSupportDto } from "./clientSupport.ts";
export type { Assert, Equal } from "./exactly.ts";
