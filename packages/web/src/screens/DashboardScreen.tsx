import { useQuery } from "@tanstack/react-query";
import { Page, PageTitle } from "../components/ui.tsx";
import { trpc } from "../trpc.ts";

/**
 * Phase 1 placeholder. Proves the full wiring — Clerk session → tRPC
 * orgProtectedProcedure → DI-resolved context — by round-tripping the
 * authenticated business. Real dashboards arrive with Phase 4 reports.
 */
export function DashboardScreen() {
  const org = useQuery(trpc.auth.organization.queryOptions());

  return (
    <Page max="4xl">
      <PageTitle>
        Dashboard
      </PageTitle>
      {org.isLoading ? (
        <p className="mt-2 text-gray-500">Loading…</p>
      ) : org.isError ? (
        <p className="mt-2 text-red-600">
          Couldn&apos;t reach the API: {org.error.message}
        </p>
      ) : (
        <p className="mt-2 text-gray-600">
          Signed in to <span className="font-medium">{org.data?.orgSlug}</span>{" "}
          as <span className="font-medium">{org.data?.orgRole}</span>. Locations,
          machines, and reports arrive in the next phases.
        </p>
      )}
    </Page>
  );
}
