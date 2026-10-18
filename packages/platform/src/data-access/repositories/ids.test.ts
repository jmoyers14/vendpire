import { describe, expect, it } from "bun:test";
import { Types } from "mongoose";
import { toId } from "./ids.ts";

describe("toId", () => {
  it("renders an ObjectId as its 24-hex string", () => {
    const oid = new Types.ObjectId("507f1f77bcf86cd799439011");
    expect(toId(oid)).toBe("507f1f77bcf86cd799439011");
  });

  // The bug this helper exists to prevent: String(null) is "null", which
  // typechecks and would reach the client as a real-looking id.
  it("renders null as null, never the string \"null\"", () => {
    expect(toId(null)).toBeNull();
  });

  it("renders undefined as null — a path absent from an old document", () => {
    expect(toId(undefined)).toBeNull();
  });
});
