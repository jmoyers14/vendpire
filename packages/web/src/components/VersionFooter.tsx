import { useQuery } from "@tanstack/react-query";
import { trpc } from "../trpc.ts";

// Baked in at build time by the deploy pipeline; placeholders in local dev.
const WEB_VERSION = import.meta.env.VITE_APP_VERSION ?? "0.0.0";
const WEB_COMMIT = import.meta.env.VITE_GIT_SHA ?? "dev";
const WEB_BUILT_AT = import.meta.env.VITE_BUILT_AT ?? "local";

/**
 * Shows the running build so a user can read it back when troubleshooting.
 * Reports the web bundle's own stamp, then fetches the API's stamp — a mismatch
 * means a deploy only half-landed (one service shipped, the other didn't).
 */
export function VersionFooter() {
  const api = useQuery({
    ...trpc.system.version.queryOptions(),
    staleTime: Infinity,
    retry: false,
  });

  const apiCommit = api.data?.commit;
  const skew = apiCommit !== undefined && apiCommit !== WEB_COMMIT;

  return (
    <footer className="px-4 py-3 text-center text-xs text-gray-400 md:px-6">
      <span title={`web built ${WEB_BUILT_AT}`}>
        Vendpire v{WEB_VERSION} ({WEB_COMMIT})
      </span>
      {skew ? (
        <span className="ml-2 text-amber-600" title="API build differs from web">
          · API {apiCommit}
        </span>
      ) : null}
    </footer>
  );
}
