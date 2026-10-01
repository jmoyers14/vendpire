import { ClerkProvider } from "@clerk/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { PostHogProvider } from "posthog-js/react";
import React from "react";
import ReactDOM from "react-dom/client";
import { AnalyticsBridge } from "./analytics/AnalyticsBridge.tsx";
import { initAnalytics, posthog } from "./analytics/posthog.ts";
import { router } from "./router.tsx";
import { queryClient } from "./trpc.ts";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in environment");
}

initAnalytics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <PostHogProvider client={posthog}>
        <QueryClientProvider client={queryClient}>
          <AnalyticsBridge />
          <RouterProvider router={router} />
        </QueryClientProvider>
      </PostHogProvider>
    </ClerkProvider>
  </React.StrictMode>,
);
