import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@vendpire/api";

// Clerk attaches its instance to window once ClerkProvider mounts. The tRPC
// client lives at module scope (outside React), so we read the session token
// from the global rather than the useAuth() hook.
declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: () => Promise<string | null>;
      } | null;
    };
  }
}

export const queryClient = new QueryClient();

const getApiUrl = () => {
  return import.meta.env.VITE_API_URL ?? "http://localhost:3000";
};

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: getApiUrl(),
      async headers() {
        const token = await window.Clerk?.session?.getToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
