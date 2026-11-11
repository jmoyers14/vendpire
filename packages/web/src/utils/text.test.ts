import { describe, expect, test } from "bun:test";
import { plural } from "./text.ts";

describe("plural", () => {
  test("one takes the singular", () => {
    expect(plural(1, { one: "slot", many: "slots" })).toBe("1 slot");
  });

  test("zero and many take the plural", () => {
    expect(plural(0, { one: "slot", many: "slots" })).toBe("0 slots");
    expect(plural(3, { one: "slot wasn't", many: "slots weren't" })).toBe("3 slots weren't");
  });
});
