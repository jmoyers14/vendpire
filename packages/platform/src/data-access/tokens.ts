/**
 * Dependency-injection tokens for repositories. Kept in their own side-effect-
 * free module (mirroring services/tokens.ts in the api package) so consumers can
 * import a token without triggering DI registration or pulling Mongoose into
 * their compile.
 */
export const LOCATION_REPOSITORY_TOKEN = "LocationRepository";
export const MACHINE_REPOSITORY_TOKEN = "MachineRepository";
export const MACHINE_TEMPLATE_REPOSITORY_TOKEN = "MachineTemplateRepository";
export const PRODUCT_REPOSITORY_TOKEN = "ProductRepository";
export const PLANOGRAM_REPOSITORY_TOKEN = "PlanogramRepository";
export const PURCHASE_REPOSITORY_TOKEN = "PurchaseRepository";
export const PACK_REPOSITORY_TOKEN = "PackRepository";

// Platform-infrastructure records, not tenant data: the raw webhook audit trail
// and the background-job ledger. Neither is org-scoped — see their models.
export const WEBHOOK_EVENT_REPOSITORY_TOKEN = "WebhookEventRepository";
export const JOB_REPOSITORY_TOKEN = "JobRepository";

// Mirrors of Clerk-held identity, kept current by the webhook handlers. Clerk
// stays the source of truth; these exist so the app can name a person or a
// business without a per-request API call.
export const USER_REPOSITORY_TOKEN = "UserRepository";
export const ORGANIZATION_REPOSITORY_TOKEN = "OrganizationRepository";
export const ORGANIZATION_MEMBERSHIP_REPOSITORY_TOKEN =
  "OrganizationMembershipRepository";
