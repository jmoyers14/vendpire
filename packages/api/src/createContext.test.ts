import { describe, expect, it } from "bun:test";
import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import { createContext } from "./createContext.ts";
import { container, AUTH_SERVICE_TOKEN } from "./services/index.ts";
import type { AuthService } from "./services/AuthService/AuthService.ts";

/**
 * A stub that records exactly what createContext handed AuthService, so these
 * tests prove the header reached authentication rather than re-checking
 * AuthServiceImpl's own Bearer-parsing (covered elsewhere).
 */
const stubAuthService = (): {
  authService: AuthService;
  received: (string | undefined)[];
} => {
  const received: (string | undefined)[] = [];
  return {
    received,
    authService: {
      authenticate: async (authHeader) => {
        received.push(authHeader);
        return null;
      },
    },
  };
};

describe("createContext auth header extraction", () => {
  // The REST adapter (trpc-to-openapi) hands createContext a Fetch API
  // Request, whose headers are a Headers object. createContext used to read
  // `.authorization` off it directly, which is always undefined on a Headers
  // object — every authenticated REST call silently saw no credentials.
  it("reads the Authorization header off a Fetch-style Request", async () => {
    const { authService, received } = stubAuthService();
    container.register(AUTH_SERVICE_TOKEN, { useValue: authService });

    const request = new Request("https://api.example.com/v1/visits", {
      headers: { authorization: "Bearer test-token" },
    });

    await createContext({ req: request } as unknown as CreateHTTPContextOptions);

    expect(received).toEqual(["Bearer test-token"]);
  });

  // The standalone tRPC adapter hands createContext a Node IncomingMessage,
  // whose headers are a plain object. This path already worked; it's here so
  // a future refactor of authorizationHeaderFrom can't regress it.
  it("reads the Authorization header off a Node IncomingMessage-style req", async () => {
    const { authService, received } = stubAuthService();
    container.register(AUTH_SERVICE_TOKEN, { useValue: authService });

    const req = { headers: { authorization: "Bearer test-token" } };

    await createContext({ req } as unknown as CreateHTTPContextOptions);

    expect(received).toEqual(["Bearer test-token"]);
  });

  it("passes undefined through when neither header shape carries one", async () => {
    const { authService, received } = stubAuthService();
    container.register(AUTH_SERVICE_TOKEN, { useValue: authService });

    const request = new Request("https://api.example.com/v1/visits");

    await createContext({ req: request } as unknown as CreateHTTPContextOptions);

    expect(received).toEqual([undefined]);
  });
});
