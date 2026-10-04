import { describe, expect, it } from "bun:test";
import { JOB_TYPES, QUEUES } from "@vendpire/platform";
import { routeEvent } from "./eventRouting.ts";

describe("routeEvent", () => {
  it("routes both user events to syncUser on the user queue", () => {
    for (const type of ["user.created", "user.updated"]) {
      expect(routeEvent(type)).toEqual({
        jobType: JOB_TYPES.SYNC_USER,
        queue: QUEUES.USER_SYNC,
      });
    }
  });

  it("routes both organization events to syncOrg on the org queue", () => {
    for (const type of ["organization.created", "organization.updated"]) {
      expect(routeEvent(type)).toEqual({
        jobType: JOB_TYPES.SYNC_ORG,
        queue: QUEUES.ORG_SYNC,
      });
    }
  });

  it("routes all three membership events to one job type and queue", () => {
    // They share a payload shape and a retry policy; the handler branches on the
    // recorded event's type to tell an upsert from a removal.
    for (const type of [
      "organizationMembership.created",
      "organizationMembership.updated",
      "organizationMembership.deleted",
    ]) {
      expect(routeEvent(type)).toEqual({
        jobType: JOB_TYPES.SYNC_ORG_MEMBERSHIP,
        queue: QUEUES.ORG_MEMBERSHIP_SYNC,
      });
    }
  });

  it("returns null for the delete events we deliberately don't act on", () => {
    // Recorded for audit, then ignored — not an oversight, see eventRouting.ts.
    expect(routeEvent("user.deleted")).toBeNull();
    expect(routeEvent("organization.deleted")).toBeNull();
  });

  it("returns null for any other event Clerk sends", () => {
    // We subscribe broadly, so most verified events land here. Null is normal.
    expect(routeEvent("session.created")).toBeNull();
    expect(routeEvent("organizationInvitation.created")).toBeNull();
    expect(routeEvent("")).toBeNull();
  });

  it("does not resolve inherited Object properties as routes", () => {
    // A Record lookup on a prototype key would otherwise hand back a function.
    expect(routeEvent("toString")).toBeNull();
    expect(routeEvent("constructor")).toBeNull();
  });
});
