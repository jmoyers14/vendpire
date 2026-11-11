import { describe, expect, it } from "bun:test";
import { buildFaceLines } from "./visitFace.ts";

const line = (productId: string, remaining: number, added: number, removed = 0) => ({
  productId,
  remaining,
  added,
  removed,
});

describe("buildFaceLines", () => {
  it("puts a swapped-in product first and marks the swapped-out one as out", () => {
    const lines = [line("cheetos", 0, 0), line("doritos", 0, 5)];

    const faceLines = buildFaceLines(lines);

    expect(faceLines.map(({ line: { productId }, hasLeftSlot }) => [productId, hasLeftSlot])).toEqual([
      ["doritos", false],
      ["cheetos", true],
    ]);
  });

  it("marks a product moved out with units as out", () => {
    const lines = [line("cheetos", 4, 0, 4), line("doritos", 2, 8)];

    const faceLines = buildFaceLines(lines);

    expect(faceLines.find(({ line: { productId } }) => productId === "cheetos")?.hasLeftSlot).toBe(true);
  });

  it("keeps front-to-back order when every product is still stocked", () => {
    const lines = [line("kars", 3, 2), line("nerds", 1, 4)];

    const faceLines = buildFaceLines(lines);

    expect(faceLines.map(({ line: { productId }, hasLeftSlot }) => [productId, hasLeftSlot])).toEqual([
      ["kars", false],
      ["nerds", false],
    ]);
  });

  it("does not mark anything out when the whole slot walked away empty", () => {
    const lines = [line("kars", 0, 0), line("nerds", 0, 0)];

    const faceLines = buildFaceLines(lines);

    expect(faceLines.every(({ hasLeftSlot }) => !hasLeftSlot)).toBe(true);
  });

  it("does not mark a sold-out single product as out", () => {
    const faceLines = buildFaceLines([line("kars", 0, 0)]);

    expect(faceLines).toEqual([{ line: line("kars", 0, 0), hasLeftSlot: false }]);
  });
});
