import { describe, expect, it } from "bun:test";
import { objectId } from "./validators.ts";

describe("objectId", () => {
  it("accepts a 24-hex id", () => {
    expect(objectId().parse("507f1f77bcf86cd799439011")).toBe(
      "507f1f77bcf86cd799439011",
    );
  });

  it("accepts uppercase hex — Mongo casts it either way", () => {
    expect(objectId().parse("507F1F77BCF86CD799439011")).toBe(
      "507F1F77BCF86CD799439011",
    );
  });

  /**
   * The whole point. Before the id paths were ObjectIds this value stored
   * silently as a foreign key pointing at nothing; now it would reach Mongoose
   * and raise a CastError, which is a 500 for what is plainly a bad request.
   */
  it("rejects a value that is not an id at all", () => {
    expect(() => objectId().parse("p_1")).toThrow();
  });

  it("rejects a 24-character string that isn't hex", () => {
    expect(() => objectId().parse("zzzzzzzzzzzzzzzzzzzzzzzz")).toThrow();
  });

  it("rejects a hex string of the wrong length", () => {
    expect(() => objectId().parse("507f1f77bcf86cd79943901")).toThrow();
    expect(() => objectId().parse("507f1f77bcf86cd7994390111")).toThrow();
  });

  it("rejects an empty string, which z.string().min(1) also caught", () => {
    expect(() => objectId().parse("")).toThrow();
  });
});
