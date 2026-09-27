/**
 * Dependency-injection tokens for repositories. Kept in their own side-effect-
 * free module (mirroring services/tokens.ts in the api package) so consumers can
 * import a token without triggering DI registration or pulling Mongoose into
 * their compile.
 */
export const LOCATION_REPOSITORY_TOKEN = "LocationRepository";
export const MACHINE_REPOSITORY_TOKEN = "MachineRepository";
export const PRODUCT_REPOSITORY_TOKEN = "ProductRepository";
export const PLANOGRAM_REPOSITORY_TOKEN = "PlanogramRepository";
export const PURCHASE_REPOSITORY_TOKEN = "PurchaseRepository";
