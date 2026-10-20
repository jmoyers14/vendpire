// Server-only imports must stay out of this module: `Context` references
// MobileConfig, and the web client compiles Context through AppRouter, so a
// `@vendpire/platform/server` import here fails the browser build with TS1206.
// The env loader lives in loadMobileConfig.ts.

/** Policy for which iOS builds the server still supports. */
export interface MobileConfig {
  /** Builds below this are refused. `0` supports everything. */
  iosMinimumBuild: number;
  /** Builds below this get a dismissible nudge. */
  iosRecommendedBuild: number;
  /** Where the update wall sends people. */
  iosUpdateUrl: string;
}

export const MOBILE_CONFIG_TOKEN = "MobileConfig";
