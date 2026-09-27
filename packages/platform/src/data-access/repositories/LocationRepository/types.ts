/**
 * Location entity — plain data, free of Mongoose types. The repository maps
 * documents to this shape so nothing driver-related leaks past the boundary.
 */
export interface LocationCommission {
  type: "none" | "percent" | "flat";
  /** Basis points (1000 = 10%) — never a float percentage. */
  percentBps: number | null;
  flatCents: number | null;
  /** What a percentage applies to: total sales, or sales net of card fees. */
  basis: "gross" | "net" | null;
}

export interface Location {
  id: string;
  name: string;
  address: {
    line1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
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
