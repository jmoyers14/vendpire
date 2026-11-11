import { describe, expect, test } from "bun:test";
import { isSameDraft } from "./draftEquality.ts";

describe("isSameDraft", () => {
  test("a draft equals an identical copy", () => {
    const saved = { name: "7up - 12 oz", price: "2.00", isActive: true };

    expect(isSameDraft(saved, { ...saved })).toBe(true);
  });

  test("key order does not make a draft dirty", () => {
    expect(isSameDraft({ a: "1", b: "2" }, { b: "2", a: "1" })).toBe(true);
  });

  test("an edited field makes it dirty", () => {
    expect(isSameDraft({ price: "2.00" }, { price: "2.50" })).toBe(false);
  });

  test("a flipped boolean makes it dirty", () => {
    expect(isSameDraft({ isActive: true }, { isActive: false })).toBe(false);
  });

  test("nested line items are compared by value", () => {
    const lines = [{ productId: "p1", quantity: "24" }];

    expect(isSameDraft({ lines }, { lines: [{ ...lines[0] }] })).toBe(true);
    expect(
      isSameDraft({ lines }, { lines: [{ productId: "p1", quantity: "25" }] }),
    ).toBe(false);
  });

  test("an added or removed line makes it dirty", () => {
    const one = [{ productId: "p1" }];
    const two = [{ productId: "p1" }, { productId: "p2" }];

    expect(isSameDraft({ lines: one }, { lines: two })).toBe(false);
  });

  test("null and an empty object are different", () => {
    expect(isSameDraft({ imageUrl: null }, { imageUrl: {} })).toBe(false);
  });

  test("an array and an object with the same keys are different", () => {
    expect(isSameDraft(["a"], { 0: "a" })).toBe(false);
  });
});
