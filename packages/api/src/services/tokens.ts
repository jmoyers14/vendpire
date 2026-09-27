/**
 * Dependency-injection tokens for this entrypoint's services. Side-effect-free
 * so a consumer can import a token without triggering DI registration. Infra
 * services first; entity services follow in Phase 3.
 */
export const AUTH_SERVICE_TOKEN = "AuthService";
