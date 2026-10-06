import { describe, expect, it } from "bun:test";
import { purchaseListFilter } from "./PurchaseRepositoryImpl.ts";

const ORG = "org_1";
const AT = "2026-09-20T12:00:00.000Z";
const ID = "6500a1b2c3d4e5f607182930";

/**
 * The filter IS the correctness story for keyset pagination, and there is no
 * Mongo harness at this layer — so it is asserted as a plain object.
 */
describe("purchaseListFilter", () => {
  it("scopes to the org and excludes soft-deleted rows", () => {
    expect(purchaseListFilter(ORG, { limit: 50 })).toEqual({
      orgId: ORG,
      deletedAt: null,
    });
  });

  // An unfiltered read must not be accidentally bounded by an empty range.
  it("omits purchasedAt entirely when no range is given", () => {
    expect(purchaseListFilter(ORG, { limit: 50 })).not.toHaveProperty(
      "purchasedAt",
    );
  });

  it("bounds the lower edge inclusively for from", () => {
    expect(purchaseListFilter(ORG, { limit: 50, from: AT }).purchasedAt).toEqual({
      $gte: new Date(AT),
    });
  });

  it("bounds the upper edge inclusively for to", () => {
    expect(purchaseListFilter(ORG, { limit: 50, to: AT }).purchasedAt).toEqual({
      $lte: new Date(AT),
    });
  });

  it("bounds both edges when given both", () => {
    const to = "2026-09-30T23:59:59.999Z";
    expect(
      purchaseListFilter(ORG, { limit: 50, from: AT, to }).purchasedAt,
    ).toEqual({ $gte: new Date(AT), $lte: new Date(to) });
  });

  it("ignores a null range the same way as an absent one", () => {
    expect(
      purchaseListFilter(ORG, { limit: 50, from: null, to: null }),
    ).not.toHaveProperty("purchasedAt");
  });

  // The second $or branch is the only thing standing between a page boundary
  // and rows that share a purchasedAt being duplicated or skipped.
  it("walks strictly past the cursor on both branches of the tiebreaker", () => {
    expect(
      purchaseListFilter(ORG, { limit: 50, cursor: { purchasedAt: AT, id: ID } })
        .$or,
    ).toEqual([
      { purchasedAt: { $lt: new Date(AT) } },
      { purchasedAt: new Date(AT), _id: { $lt: ID } },
    ]);
  });

  it("omits $or when there is no cursor", () => {
    expect(purchaseListFilter(ORG, { limit: 50 })).not.toHaveProperty("$or");
  });

  it("ignores a null cursor", () => {
    expect(purchaseListFilter(ORG, { limit: 50, cursor: null })).not.toHaveProperty(
      "$or",
    );
  });

  // Guard against someone collapsing the two purchasedAt predicates into one
  // key, which would silently drop the date range.
  it("keeps the range and the cursor as separate top-level keys", () => {
    const filter = purchaseListFilter(ORG, {
      limit: 50,
      from: "2026-09-01T00:00:00.000Z",
      cursor: { purchasedAt: AT, id: ID },
    });
    expect(filter.purchasedAt).toEqual({ $gte: new Date("2026-09-01T00:00:00.000Z") });
    expect(filter.$or).toBeDefined();
  });
});
