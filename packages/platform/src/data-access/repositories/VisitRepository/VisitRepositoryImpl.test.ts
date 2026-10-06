import { describe, expect, it } from "bun:test";
import {
  toVisit,
  visitListFilter,
  visitPredecessorFilter,
  visitWindowFilter,
} from "./VisitRepositoryImpl.ts";

const ORG = "org_1";
const MACHINE = "m_1";
const FROM = "2026-09-01T00:00:00.000Z";
const TO = "2026-09-30T23:59:59.999Z";

/** The lean() shape toVisit consumes, taken from its own signature. */
type VisitDoc = Parameters<typeof toVisit>[0];

const doc = (overrides: Partial<VisitDoc> = {}): VisitDoc =>
  ({
    _id: "6500a1b2c3d4e5f607182930",
    machineId: MACHINE,
    locationId: "loc_1",
    countedAt: new Date("2026-09-20T17:04:00.000Z"),
    recordedByUserId: "user_1",
    lines: [
      {
        slotCode: "A1",
        productId: "p_1",
        remaining: 4,
        added: 6,
        removedUnits: 2,
        removedReason: "expired",
        priceCents: 175,
        par: 10,
      },
    ],
    clientRequestId: "req_1",
    createdAt: new Date("2026-09-20T22:10:00.000Z"),
    updatedAt: new Date("2026-09-20T22:10:00.000Z"),
    ...overrides,
  });

/**
 * The mapper is tested without a database, the way `toCommission` is in
 * LocationRepositoryImpl.test.ts. Its defaults are the point: an absent
 * `removedUnits` reaching the engine as `undefined` turns every sold figure,
 * revenue total and profit line into NaN without raising anything.
 */
describe("toVisit", () => {
  it("maps a full document, with dates as ISO instants", () => {
    expect(toVisit(doc())).toEqual({
      id: "6500a1b2c3d4e5f607182930",
      machineId: MACHINE,
      locationId: "loc_1",
      planogramId: null,
      countedAt: "2026-09-20T17:04:00.000Z",
      recordedByUserId: "user_1",
      lines: [
        {
          slotCode: "A1",
          productId: "p_1",
          remaining: 4,
          added: 6,
          removedUnits: 2,
          removedReason: "expired",
          priceCents: 175,
          par: 10,
        },
      ],
      notes: null,
      clientRequestId: "req_1",
      createdAt: "2026-09-20T22:10:00.000Z",
      updatedAt: "2026-09-20T22:10:00.000Z",
    });
  });

  // The NaN guard. A line written before removedUnits existed has no field.
  it("defaults an absent removedUnits to 0, never undefined", () => {
    const line = {
      slotCode: "A1",
      productId: "p_1",
      remaining: 4,
      added: 6,
      priceCents: 175,
    };
    const [mapped] = toVisit(doc({ lines: [line] })).lines;
    expect(mapped?.removedUnits).toBe(0);
    expect(mapped?.removedReason).toBeNull();
    expect(mapped?.par).toBeNull();
  });

  it("preserves a zero remaining rather than nulling it", () => {
    const line = {
      slotCode: "A1",
      productId: "p_1",
      remaining: 0,
      added: 0,
      priceCents: 175,
    };
    expect(toVisit(doc({ lines: [line] })).lines[0]?.remaining).toBe(0);
  });

  it("keeps a free price at 0 rather than coercing it away", () => {
    const line = { slotCode: "A1", productId: "p_1", remaining: 1, added: 0, priceCents: 0 };
    expect(toVisit(doc({ lines: [line] })).lines[0]?.priceCents).toBe(0);
  });

  it("maps optional top-level fields to null when absent", () => {
    const visit = toVisit(doc());
    expect(visit.planogramId).toBeNull();
    expect(visit.notes).toBeNull();
  });

  it("carries planogramId and notes through when present", () => {
    const visit = toVisit(doc({ planogramId: "pg_1", notes: "coil jammed" }));
    expect(visit.planogramId).toBe("pg_1");
    expect(visit.notes).toBe("coil jammed");
  });

  it("stringifies the ObjectId", () => {
    const visit = toVisit(doc({ _id: { toString: () => "abc123" } }));
    expect(visit.id).toBe("abc123");
  });

  // A re-planogram visit counts the outgoing product out alongside the
  // incoming one, so one slotCode legitimately appears twice. The mapper must
  // not collapse lines by slot.
  it("keeps both lines when one slot carries two products", () => {
    const lines = [
      { slotCode: "A1", productId: "old", remaining: 3, added: 0, priceCents: 150 },
      { slotCode: "A1", productId: "new", remaining: 0, added: 10, priceCents: 175 },
    ];
    expect(toVisit(doc({ lines })).lines).toHaveLength(2);
  });
});

describe("visitListFilter", () => {
  it("scopes to the org and excludes soft-deleted rows", () => {
    expect(visitListFilter(ORG)).toEqual({ orgId: ORG, deletedAt: null });
  });

  // An unfiltered read must not be accidentally bounded by an empty range.
  it("omits countedAt entirely when no range is given", () => {
    expect(visitListFilter(ORG)).not.toHaveProperty("countedAt");
    expect(visitListFilter(ORG, { from: null, to: null })).not.toHaveProperty(
      "countedAt",
    );
  });

  it("narrows to one machine only when asked", () => {
    expect(visitListFilter(ORG, { machineId: MACHINE }).machineId).toBe(MACHINE);
    expect(visitListFilter(ORG, { machineId: null })).not.toHaveProperty(
      "machineId",
    );
  });

  it("bounds both edges inclusively", () => {
    expect(visitListFilter(ORG, { from: FROM, to: TO }).countedAt).toEqual({
      $gte: new Date(FROM),
      $lte: new Date(TO),
    });
  });

  it("bounds a single edge when given one", () => {
    expect(visitListFilter(ORG, { from: FROM }).countedAt).toEqual({
      $gte: new Date(FROM),
    });
    expect(visitListFilter(ORG, { to: TO }).countedAt).toEqual({
      $lte: new Date(TO),
    });
  });
});

describe("visitWindowFilter", () => {
  it("scopes to the org and machine and excludes soft-deleted rows", () => {
    expect(visitWindowFilter(ORG, MACHINE)).toEqual({
      orgId: ORG,
      machineId: MACHINE,
      deletedAt: null,
    });
  });

  it("bounds the window inclusively at both edges", () => {
    expect(visitWindowFilter(ORG, MACHINE, { from: FROM, to: TO }).countedAt).toEqual(
      { $gte: new Date(FROM), $lte: new Date(TO) },
    );
  });
});

/**
 * The predecessor read is what keeps a windowed P&L honest. Without it the
 * first visit in the window has no baseline, reports `first-visit`, and books
 * zero revenue for an interval that really sold something.
 */
describe("visitPredecessorFilter", () => {
  it("looks STRICTLY before the window, not at or before it", () => {
    expect(visitPredecessorFilter(ORG, MACHINE, FROM)).toEqual({
      orgId: ORG,
      machineId: MACHINE,
      deletedAt: null,
      countedAt: { $lt: new Date(FROM) },
    });
  });

  // $lte here would re-fetch a visit stamped exactly at `from`, which the
  // window already returned, and the engine would pair it against itself for a
  // zero-length interval.
  it("never uses $lte, which would duplicate a visit stamped at `from`", () => {
    const bounds = visitPredecessorFilter(ORG, MACHINE, FROM).countedAt as Record<
      string,
      unknown
    >;
    expect(bounds).not.toHaveProperty("$lte");
  });

  it("keeps full millisecond precision", () => {
    const at = "2026-09-20T17:04:33.187Z";
    expect(visitPredecessorFilter(ORG, MACHINE, at).countedAt).toEqual({
      $lt: new Date(at),
    });
  });
});
