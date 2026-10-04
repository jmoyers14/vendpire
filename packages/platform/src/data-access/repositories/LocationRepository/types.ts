/**
 * Location entity — plain data, free of Mongoose types. The repository maps
 * documents to this shape so nothing driver-related leaks past the boundary.
 */
export interface NoCommission {
  type: "none";
}

export interface PercentCommission {
  type: "percent";
  /** Basis points (1000 = 10%) — never a float percentage. */
  percentBps: number;
  /** What the percentage applies to: total sales, or sales net of card fees. */
  basis: "gross" | "net";
}

export interface FlatCommission {
  type: "flat";
  flatCents: number;
}

/**
 * What a location is owed. A union rather than one shape with nullable
 * payloads: a percent commission ALWAYS has basis points and a basis, a flat
 * one always has cents, and neither carries the other's fields. The flat shape
 * admitted 36 combinations when only these three can occur, which pushed a
 * null check onto every reader.
 *
 * The stored document still carries all four keys — narrowing happens in the
 * repository mapper, so no migration is needed.
 */
export type LocationCommission =
  | NoCommission
  | PercentCommission
  | FlatCommission;

export interface Location {
  id: string;
  name: string;
  address: {
    line1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    /** From the Places resolve — enables route planning later. */
    geo: { lat: number; lng: number } | null;
  };
  contact: {
    name: string | null;
    phone: string | null;
    email: string | null;
  };
  commission: LocationCommission;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fields accepted when creating or replacing a location — the persisted fields
 * minus the server-managed id/timestamps. Derived so the two can't drift.
 */
export type LocationInput = Omit<Location, "id" | "createdAt" | "updatedAt">;
