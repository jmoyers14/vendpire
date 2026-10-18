import { Types } from "mongoose";

const minted = new Map<string, Types.ObjectId>();

/**
 * A stable ObjectId for a readable label, so fixtures can keep saying `"coke"`
 * and `"m_1"` now that the id paths are ObjectIds and a 24-hex literal would
 * make every test unreadable.
 *
 * The same label is the same id for the life of the process, and two labels are
 * never the same id — which is what lets a test assert a relationship rather
 * than just a value.
 */
export const oid = (label: string): Types.ObjectId => {
  const existing = minted.get(label);
  if (existing) {
    return existing;
  }
  const fresh = new Types.ObjectId();
  minted.set(label, fresh);
  return fresh;
};

/** The same id as `oid(label)`, as the 24-hex string an entity carries. */
export const oidHex = (label: string): string => oid(label).toHexString();
