/**
 * The server-side half of the forced-update mechanism: policy about which iOS
 * builds are still supported. The app reports its own build and obeys a
 * verdict — it never learns these numbers, which is what lets us raise the
 * floor without shipping an app. See `docs/diagrams/forced-update.md`.
 *
 * **This module must stay free of server-only imports.** `Context` references
 * `MobileConfig`, and the web client resolves `Context` to consume the
 * `AppRouter` type. Pulling `@vendpire/platform/server` in here drags
 * tsyringe-decorated classes into the browser compile, which fails with
 * TS1206. That is why the loader lives in `loadMobileConfig.ts` instead.
 */
export interface MobileConfig {
  /** Builds below this are refused. `0` supports everything. */
  iosMinimumBuild: number;
  /** Builds below this get a dismissible nudge. `0` nudges nobody. */
  iosRecommendedBuild: number;
  /** Where the wall sends people. Server-driven so it can be repointed at
   * TestFlight, or at a changed app id, without shipping a build. */
  iosUpdateUrl: string;
}

export const MOBILE_CONFIG_TOKEN = "MobileConfig";
