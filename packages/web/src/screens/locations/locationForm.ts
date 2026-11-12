import type { ApiLocation } from "../../apiTypes.ts";
import {
  bpsToInput,
  centsToInput,
  parseDollarsToCents,
  parsePercentToBps,
} from "../../utils/money.ts";
import { nullIfBlank } from "../../utils/text.ts";
import {
  type Commission,
  isFlatCommission,
  isPercentCommission,
  type PercentCommission,
} from "./commission.ts";

/**
 * The location form's draft and how it becomes what the API takes. Pure, so
 * the rules are tested without a browser.
 */

export type CommissionType = Commission["type"];
export type CommissionBasis = PercentCommission["basis"];
type LocationAddress = ApiLocation["address"];

/** Strings because they back inputs; parsed only on save. */
export interface LocationDraft {
  name: string;
  line1: string;
  /** Set when an address suggestion is picked; any hand edit clears it. */
  geo: LocationAddress["geo"];
  city: string;
  state: string;
  zip: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  commissionType: CommissionType;
  commissionPercent: string;
  commissionBasis: CommissionBasis;
  commissionFlat: string;
  notes: string;
  isActive: boolean;
}

export const EMPTY_LOCATION_DRAFT: LocationDraft = {
  name: "",
  line1: "",
  geo: null,
  city: "",
  state: "CA",
  zip: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  commissionType: "none",
  commissionPercent: "",
  commissionBasis: "gross",
  commissionFlat: "",
  notes: "",
  isActive: true,
};

/** A saved location, reopened for editing. */
export const draftFor = (location: ApiLocation): LocationDraft => {
  const { commission } = location;
  return {
    name: location.name,
    line1: location.address.line1 ?? "",
    geo: location.address.geo,
    city: location.address.city ?? "",
    state: location.address.state ?? "",
    zip: location.address.zip ?? "",
    contactName: location.contact.name ?? "",
    contactPhone: location.contact.phone ?? "",
    contactEmail: location.contact.email ?? "",
    commissionType: commission.type,
    commissionPercent: isPercentCommission(commission) ? bpsToInput(commission.percentBps) : "",
    commissionBasis: isPercentCommission(commission) ? commission.basis : "gross",
    commissionFlat: isFlatCommission(commission) ? centsToInput(commission.flatCents) : "",
    notes: location.notes ?? "",
    isActive: location.active,
  };
};

export interface LocationInput {
  name: string;
  address: LocationAddress;
  contact: { name: string | null; phone: string | null; email: string | null };
  commission: Commission;
  notes: string | null;
  active: boolean;
}

export type LocationFieldErrors = Partial<
  Record<"name" | "commissionPercent" | "commissionFlat", string>
>;

const commissionFor = (
  draft: LocationDraft,
): { commission: Commission } | { errors: LocationFieldErrors } => {
  if (draft.commissionType === "percent") {
    const percentBps = parsePercentToBps(draft.commissionPercent);
    if (percentBps === null) {
      return { errors: { commissionPercent: "Enter a percent between 0 and 100" } };
    }
    return { commission: { type: "percent", percentBps, basis: draft.commissionBasis } };
  }
  if (draft.commissionType === "flat") {
    const flatCents = parseDollarsToCents(draft.commissionFlat);
    if (flatCents === null || flatCents === 0) {
      return { errors: { commissionFlat: "Enter a dollar amount, e.g. 50" } };
    }
    return { commission: { type: "flat", flatCents } };
  }
  return { commission: { type: "none" } };
};

/** The draft as the API takes it, or an error under each field that's wrong. */
export const buildLocationInput = (
  draft: LocationDraft,
): { input: LocationInput } | { errors: LocationFieldErrors } => {
  const commissionResult = commissionFor(draft);
  const errors: LocationFieldErrors = {
    ...("errors" in commissionResult ? commissionResult.errors : {}),
    ...(draft.name.trim() === "" ? { name: "Enter a name" } : {}),
  };
  if ("errors" in commissionResult || Object.keys(errors).length > 0) {
    return { errors };
  }
  return {
    input: {
      name: draft.name.trim(),
      address: {
        line1: nullIfBlank(draft.line1),
        city: nullIfBlank(draft.city),
        state: nullIfBlank(draft.state),
        zip: nullIfBlank(draft.zip),
        geo: draft.geo,
      },
      contact: {
        name: nullIfBlank(draft.contactName),
        phone: nullIfBlank(draft.contactPhone),
        email: nullIfBlank(draft.contactEmail),
      },
      commission: commissionResult.commission,
      notes: nullIfBlank(draft.notes),
      active: draft.isActive,
    },
  };
};

/** "123 Main St, San Jose, CA 95112", skipping whatever is blank. Null when all of it is. */
export const addressLineFor = (address: ApiLocation["address"]): string | null => {
  const stateZip = [address.state, address.zip].filter(Boolean).join(" ");
  const parts = [address.line1, address.city, stateZip].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
};

/**
 * A phone number as a tel: link: digits and a leading + only. An extension is
 * dropped, since its digits would run into the number and dial the wrong one.
 */
export const telHrefFor = (phone: string): string => {
  const [number = ""] = phone.split(/\s*(?:ext|x|#)/i);
  return `tel:${number.replace(/[^\d+]/g, "")}`;
};
