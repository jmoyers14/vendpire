import { describe, expect, it } from "bun:test";
import {
  buildUserIdMap,
  describeMongoUri,
  isLocalMongoUri,
  resolveSourceOrgId,
  resolveTargetOrgId,
  toRemapped,
  type IdMapping,
} from "./mapping.ts";

const mapping: IdMapping = {
  orgId: { from: "org_old", to: "org_new" },
  userIds: new Map([["user_old_a", "user_new_a"]]),
};

describe("resolveSourceOrgId", () => {
  it("takes the only org the source holds", () => {
    expect(resolveSourceOrgId(["org_a", "org_a"], undefined)).toEqual({ ok: true, value: "org_a" });
  });

  it("refuses to guess between several orgs", () => {
    const result = resolveSourceOrgId(["org_a", "org_b"], undefined);
    expect(result.ok).toBe(false);
  });

  it("accepts a named org only if the source holds it", () => {
    expect(resolveSourceOrgId(["org_a", "org_b"], "org_b")).toEqual({ ok: true, value: "org_b" });
    expect(resolveSourceOrgId(["org_a"], "org_z").ok).toBe(false);
  });
});

describe("buildUserIdMap", () => {
  it("pairs users by email, ignoring case", () => {
    const result = buildUserIdMap({
      sourceUserIds: ["user_old_a", "user_old_a"],
      sourceEmailByUserId: new Map([["user_old_a", "Me@Example.com"]]),
      targetUserIdByEmail: new Map([["me@example.com", "user_new_a"]]),
    });
    expect(result).toEqual({ ok: true, value: new Map([["user_old_a", "user_new_a"]]) });
  });

  it("fails when any source user has no match, naming every one", () => {
    const result = buildUserIdMap({
      sourceUserIds: ["user_old_a", "user_old_b"],
      sourceEmailByUserId: new Map([["user_old_a", "a@example.com"]]),
      targetUserIdByEmail: new Map(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem).toContain("user_old_a");
      expect(result.problem).toContain("user_old_b");
    }
  });
});

describe("resolveTargetOrgId", () => {
  it("takes the one org every mapped user shares", () => {
    expect(resolveTargetOrgId([["org_x", "org_y"], ["org_y"]], undefined)).toEqual({ ok: true, value: "org_y" });
  });

  it("refuses when the users share none, or several", () => {
    expect(resolveTargetOrgId([["org_x"], ["org_y"]], undefined).ok).toBe(false);
    expect(resolveTargetOrgId([["org_x", "org_y"], ["org_x", "org_y"]], undefined).ok).toBe(false);
  });

  it("uses a named org as given", () => {
    expect(resolveTargetOrgId([], "org_z")).toEqual({ ok: true, value: "org_z" });
  });
});

describe("toRemapped", () => {
  it("swaps orgId and leaves everything else, _id included", () => {
    const product = { _id: "p1", orgId: "org_old", name: "Cola" };
    expect(toRemapped("products", product, mapping)).toEqual({ _id: "p1", orgId: "org_new", name: "Cola" });
  });

  it("swaps who recorded a visit", () => {
    const visit = { _id: "v1", orgId: "org_old", recordedByUserId: "user_old_a" };
    expect(toRemapped("visits", visit, mapping).recordedByUserId).toBe("user_new_a");
  });

  it("throws on a visit by an unmapped user rather than copying a dangling id", () => {
    const visit = { _id: "v1", orgId: "org_old", recordedByUserId: "user_stranger" };
    expect(() => toRemapped("visits", visit, mapping)).toThrow("unmapped");
  });
});

describe("isLocalMongoUri", () => {
  it("treats localhost as local and Atlas as remote", () => {
    expect(isLocalMongoUri("mongodb://localhost:27017/vendpire")).toBe(true);
    expect(isLocalMongoUri("mongodb://127.0.0.1/vendpire")).toBe(true);
    expect(isLocalMongoUri("mongodb+srv://u:p@cluster0.example.mongodb.net/zenvend")).toBe(false);
  });
});

describe("describeMongoUri", () => {
  it("drops credentials", () => {
    expect(describeMongoUri("mongodb+srv://user:secret@cluster0.example.mongodb.net/zenvend?retryWrites=true")).toBe(
      "cluster0.example.mongodb.net/zenvend",
    );
  });
});
