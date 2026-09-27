import { useEffect } from "react";
import { useAuth, useOrganization } from "@clerk/react";
import { router } from "../router.tsx";
import { analyticsEnabled, posthog } from "./posthog.ts";

/**
 * Connects Clerk identity + TanStack Router navigation to PostHog. Renders
 * nothing. Identifying by the Clerk userId is what fuses browser-side events
 * with the server-side events onto a single person; grouping by org gives
 * per-business analytics.
 */
export function AnalyticsBridge() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { organization } = useOrganization();

  useEffect(() => {
    if (!analyticsEnabled || !isLoaded) {
      return;
    }
    if (isSignedIn && userId) {
      posthog.identify(userId);
    } else {
      // Clears the identified person so a shared browser doesn't blend users.
      posthog.reset();
    }
  }, [isLoaded, isSignedIn, userId]);

  useEffect(() => {
    if (!analyticsEnabled || !organization) {
      return;
    }
    posthog.group("organization", organization.id, {
      name: organization.name,
    });
  }, [organization?.id, organization?.name]);

  useEffect(() => {
    if (!analyticsEnabled) {
      return;
    }
    // Auto pageview is off, so capture the initial load plus every navigation.
    posthog.capture("$pageview");
    return router.subscribe("onResolved", () => {
      posthog.capture("$pageview");
    });
  }, []);

  return null;
}
