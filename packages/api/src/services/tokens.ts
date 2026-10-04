/**
 * Dependency-injection tokens for this entrypoint's services. Side-effect-free
 * so a consumer can import a token without triggering DI registration. Infra
 * services first, then one per entity.
 */
export const AUTH_SERVICE_TOKEN = "AuthService";
export const ADDRESS_SERVICE_TOKEN = "AddressService";
export const LOCATION_SERVICE_TOKEN = "LocationService";
export const MACHINE_SERVICE_TOKEN = "MachineService";
export const MACHINE_TEMPLATE_SERVICE_TOKEN = "MachineTemplateService";
export const PRODUCT_SERVICE_TOKEN = "ProductService";
export const PRODUCT_DATA_SERVICE_TOKEN = "ProductDataService";
export const BARCODE_RESOLVER_SERVICE_TOKEN = "BarcodeResolverService";
export const PLANOGRAM_SERVICE_TOKEN = "PlanogramService";
export const PURCHASE_SERVICE_TOKEN = "PurchaseService";
export const PACK_SERVICE_TOKEN = "PackService";
