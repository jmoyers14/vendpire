import { describe, expect, it } from "bun:test";
import { locationDto } from "./location.ts";

describe("locationDto", () => {
  it("accepts a location with every field populated", () => {
    const parsed = locationDto.parse({
      id: "0123456789abcdef01234567",
      name: "Front lobby",
      address: {
        line1: "1 Main St",
        city: "Sacramento",
        state: "CA",
        zip: "95814",
        geo: { lat: 38.58, lng: -121.49 },
      },
      contact: { name: "Dana", phone: "555-0100", email: "dana@example.com" },
      notes: "Behind the stairs",
      active: true,
      createdAt: "2026-10-21T00:00:00.000Z",
      updatedAt: "2026-10-21T00:00:00.000Z",
    });

    expect(parsed.name).toBe("Front lobby");
    expect(parsed.address.geo).toEqual({ lat: 38.58, lng: -121.49 });
  });

  it("accepts the nulls the entity allows", () => {
    const parsed = locationDto.parse({
      id: "0123456789abcdef01234567",
      name: "Back hall",
      address: { line1: null, city: null, state: null, zip: null, geo: null },
      contact: { name: null, phone: null, email: null },
      notes: null,
      active: false,
      createdAt: "2026-10-21T00:00:00.000Z",
      updatedAt: "2026-10-21T00:00:00.000Z",
    });

    expect(parsed.address.line1).toBeNull();
    expect(parsed.contact.email).toBeNull();
  });

  it("drops commission, so the phone never sees a 3-arm union", () => {
    const parsed = locationDto.parse({
      id: "0123456789abcdef01234567",
      name: "Front lobby",
      address: { line1: null, city: null, state: null, zip: null, geo: null },
      contact: { name: null, phone: null, email: null },
      notes: null,
      active: true,
      createdAt: "2026-10-21T00:00:00.000Z",
      updatedAt: "2026-10-21T00:00:00.000Z",
      commission: { type: "percent", percentBps: 1500, basis: "gross" },
    });

    expect(parsed).not.toHaveProperty("commission");
  });

  it("registers under a component id, so the spec emits a named schema", () => {
    expect(locationDto.meta()?.id).toBe("Location");
  });
});
