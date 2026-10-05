import { describe, expect, it } from "bun:test";
import { matchesSearch } from "./textMatch.ts";

describe("matchesSearch", () => {
  it("matches everything when the query is empty", () => {
    expect(matchesSearch("Coke Zero", "")).toBe(true);
  });

  it("matches everything when the query is only whitespace", () => {
    expect(matchesSearch("Coke Zero", "   ")).toBe(true);
  });

  it("matches a substring regardless of case", () => {
    expect(matchesSearch("Coke Zero", "COKE")).toBe(true);
    expect(matchesSearch("Coke Zero", "zero")).toBe(true);
  });

  it("matches mid-word, not just at a word boundary", () => {
    expect(matchesSearch("Cheetos Flamin Hot", "lamin")).toBe(true);
  });

  it("requires every term to appear, so extra terms narrow", () => {
    expect(matchesSearch("Coke Zero 12oz Can", "coke can")).toBe(true);
    expect(matchesSearch("Coke Zero 12oz Can", "coke bottle")).toBe(false);
  });

  it("lets terms match in any order and anywhere in the text", () => {
    expect(matchesSearch("Coke Zero 12oz Can", "can coke")).toBe(true);
  });

  it("returns false when the single term is absent", () => {
    expect(matchesSearch("Coke Zero", "pepsi")).toBe(false);
  });

  it("collapses repeated whitespace between terms", () => {
    expect(matchesSearch("Coke Zero", "coke    zero")).toBe(true);
  });
});
