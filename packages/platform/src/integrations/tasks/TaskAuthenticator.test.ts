import { describe, expect, it } from "bun:test";
import { extractBearerToken, isTrustedTaskCaller } from "./TaskAuthenticator.ts";
import { GoogleOidcTaskAuthenticator } from "./GoogleOidcTaskAuthenticator.ts";
import type { TasksConfig } from "./tasksConfig.ts";

const withAuth = (value?: string): Request =>
  new Request("https://worker.local/tasks/syncUser", {
    method: "POST",
    headers: value === undefined ? {} : { authorization: value },
  });

describe("extractBearerToken", () => {
  it("returns the token from a bearer header", () => {
    expect(extractBearerToken(withAuth("Bearer abc.def.ghi"))).toBe("abc.def.ghi");
  });

  it("returns null when there is no Authorization header", () => {
    expect(extractBearerToken(withAuth())).toBeNull();
  });

  it("returns null for a non-bearer scheme", () => {
    expect(extractBearerToken(withAuth("Basic dXNlcjpwYXNz"))).toBeNull();
  });

  it("returns null for a bearer header with an empty token", () => {
    expect(extractBearerToken(withAuth("Bearer    "))).toBeNull();
  });
});

const SA = "cloud-tasks-invoker@vendpire-128694.iam.gserviceaccount.com";

describe("isTrustedTaskCaller", () => {
  it("trusts a verified token issued as the invoker service account", () => {
    expect(isTrustedTaskCaller({ email: SA, email_verified: true }, SA)).toBe(true);
  });

  it("rejects a token from a different service account", () => {
    expect(
      isTrustedTaskCaller(
        { email: "someone-else@evil.iam", email_verified: true },
        SA,
      ),
    ).toBe(false);
  });

  it("rejects the right account when its email is not verified", () => {
    // An unverified email claim is not an identity.
    expect(isTrustedTaskCaller({ email: SA, email_verified: false }, SA)).toBe(
      false,
    );
  });

  it("rejects a token with no email claim", () => {
    expect(isTrustedTaskCaller({ email_verified: true }, SA)).toBe(false);
  });

  it("rejects when there is no payload at all", () => {
    expect(isTrustedTaskCaller(undefined, SA)).toBe(false);
  });
});

describe("GoogleOidcTaskAuthenticator", () => {
  const config: TasksConfig = {
    projectId: "vendpire-128694",
    location: "us-central1",
    workerUrl: "https://worker.example.run.app",
    invokerServiceAccount: SA,
  };

  it("denies a request with no bearer token before attempting any verification", async () => {
    const auth = new GoogleOidcTaskAuthenticator(config);

    const request = new Request("https://worker.example.run.app/tasks/syncUser", {
      method: "POST",
    });

    // No token → false, and crucially no network call to Google (which would
    // otherwise throw/hang in a test). This is the adapter's fail-closed path.
    expect(await auth.authenticate(request)).toBe(false);
  });
});
