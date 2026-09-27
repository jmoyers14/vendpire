/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  // Build stamp baked in at build time by the deploy pipeline.
  readonly VITE_APP_VERSION?: string;
  readonly VITE_GIT_SHA?: string;
  readonly VITE_BUILT_AT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
