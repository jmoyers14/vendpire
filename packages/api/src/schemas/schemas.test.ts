import { describe, expect, it } from "bun:test";
import {
  clientSupportDto,
  identityDto,
  machineDto,
  packDto,
  planogramDto,
  productDto,
  purchaseDto,
  visitDto,
} from "./index.ts";

describe("output schemas", () => {
  it("each registers a component id, so the spec emits named schemas", () => {
    expect(machineDto.meta()?.id).toBe("Machine");
    expect(productDto.meta()?.id).toBe("Product");
    expect(packDto.meta()?.id).toBe("Pack");
    expect(planogramDto.meta()?.id).toBe("Planogram");
    expect(visitDto.meta()?.id).toBe("Visit");
    expect(purchaseDto.meta()?.id).toBe("Purchase");
    expect(identityDto.meta()?.id).toBe("Identity");
    expect(clientSupportDto.meta()?.id).toBe("ClientSupport");
  });

  it("machineDto keeps the shelf-of-slot-codes shape", () => {
    const parsed = machineDto.parse({
      id: "0123456789abcdef01234567",
      locationId: "0123456789abcdef01234568",
      name: "Lobby snack",
      kind: "snack",
      make: null,
      model: null,
      serial: null,
      tagCode: null,
      templateId: null,
      slots: [["A1", "A2"], ["B1"]],
      cardReader: null,
      active: true,
      createdAt: "2026-10-21T00:00:00.000Z",
      updatedAt: "2026-10-21T00:00:00.000Z",
    });

    expect(parsed.slots).toEqual([["A1", "A2"], ["B1"]]);
  });

  it("visitDto accepts a removal reason and rejects an invented one", () => {
    const line = {
      slotCode: "A1",
      productId: "0123456789abcdef01234567",
      remaining: 2,
      added: 8,
      removed: 1,
      removedReason: "expired",
      priceCents: 175,
      par: 10,
      bestBy: "2026-11-01",
    };
    const base = {
      id: "0123456789abcdef01234567",
      machineId: "0123456789abcdef01234568",
      locationId: "0123456789abcdef01234569",
      planogramId: null,
      countedAt: "2026-10-21T00:00:00.000Z",
      recordedByUserId: "user_1",
      notes: null,
      clientRequestId: "req-1",
      createdAt: "2026-10-21T00:00:00.000Z",
      updatedAt: "2026-10-21T00:00:00.000Z",
    };

    expect(visitDto.parse({ ...base, lines: [line] }).lines[0]?.removedReason)
      .toBe("expired");
    expect(
      visitDto.safeParse({
        ...base,
        lines: [{ ...line, removedReason: "borrowed" }],
      }).success,
    ).toBe(false);
  });

  it("identityDto allows a null orgId — the pending-session discovery path", () => {
    const parsed = identityDto.parse({
      userId: "user_1",
      orgId: null,
      orgRole: null,
      orgSlug: null,
    });

    expect(parsed.orgId).toBeNull();
  });
});
