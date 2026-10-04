import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@vendpire/api";

/**
 * The wire layer, named. These are what the API actually returns — derived
 * from the router, never hand-written, so a rename on the server breaks the
 * build here instead of silently drifting.
 *
 * The four layers, and which one to reach for:
 *
 *   Doc     `ProductDoc`   Mongoose shape. Private to its repository.
 *   Entity  `Product`      The platform's domain type. Server-side only.
 *   Wire    `ApiProduct`   What crosses the network. Derived, below.
 *   View    `CatalogItem`  UI-only shapes, reached through a builder.
 *
 * This file is type-only: `packages/web` depends on `@vendpire/api` for its
 * router type and nothing else, so none of this reaches the bundle.
 *
 * Scope: one type per endpoint output, and nothing else. A consumer that needs
 * only part of a record declares its own `Pick` next to the code that needs it
 * — that requirement belongs to the consumer, not to the wire, and collecting
 * them all here would turn this file into a junk drawer.
 */
type Outputs = inferRouterOutputs<AppRouter>;

export type ApiProduct = Outputs["products"]["list"][number];
export type ApiPack = Outputs["packs"]["list"][number];
export type ApiPackContent = ApiPack["contents"][number];
export type ApiPurchase = NonNullable<Outputs["purchases"]["get"]>;
export type ApiLocation = Outputs["locations"]["list"][number];
export type ApiBarcodeResolution = Outputs["barcodes"]["resolve"];

