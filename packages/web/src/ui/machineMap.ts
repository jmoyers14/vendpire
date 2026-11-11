import { matchesSearch } from "../utils/textMatch.ts";
import { type StatusTone, stockTone } from "./tone.ts";

/**
 * The letter beside a shelf: the letters its first slot code starts with ("A"
 * for A0–A8), or the shelf number when codes are plain numbers.
 */
export const shelfLabel = (shelf: string[], shelfIndex: number): string => {
  const letters = shelf[0]?.match(/^[A-Za-z]+/)?.[0];
  return letters ? letters.toUpperCase() : String(shelfIndex + 1);
};

/**
 * Whether a slot answers a "go to slot or product" query. An exact slot code
 * matches only that slot, so "D5" doesn't also light up a product called
 * "D5 Energy"; anything else is a word search over the code and products.
 */
export const isSlotMatch = ({
  slotCode,
  searchText,
  query,
  slotCodes,
}: {
  slotCode: string;
  searchText: string;
  query: string;
  slotCodes: ReadonlySet<string>;
}): boolean => {
  const normalized = query.trim().toUpperCase();
  if (slotCodes.has(normalized)) {
    return slotCode.toUpperCase() === normalized;
  }
  return matchesSearch(`${slotCode} ${searchText}`, query);
};

/**
 * A Count-step tile's meter: found ÷ par, green normally, amber at 30% or
 * less, a red track when the slot is empty.
 */
export const countMeterFor = ({
  found,
  par,
}: {
  found: number;
  par: number;
}): { meter: number; tone: StatusTone } => ({
  meter: par > 0 ? found / par : 0,
  tone: stockTone(found, par),
});
