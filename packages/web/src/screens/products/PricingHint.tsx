import { buildPricingDisplay } from "./pricing.ts";
import type { ProductPricing } from "./pricing.ts";
import { formatCents, formatSignedCents } from "../../utils/money.ts";

/**
 * What the product last cost, and what to charge for it — under the price
 * field, where the number is actually set.
 *
 * Recomputes against the field rather than the saved price, so trying $1.50
 * against $1.75 shows the margin move. Absent entirely when the product has
 * never been purchased, which is every product on the create form.
 */
export function PricingHint({
  pricing,
  priceCents,
  onUse,
}: {
  pricing: ProductPricing | undefined;
  priceCents: number | null;
  onUse: (cents: number) => void;
}) {
  if (!pricing) {
    return null;
  }

  const display = buildPricingDisplay(pricing, priceCents ?? 0);
  const { suggestedPriceCents } = display;

  return (
    <div className="space-y-0.5 pt-1 text-xs text-gray-500">
      <p>
        Last paid{" "}
        <span className="font-medium text-gray-700">
          {formatCents(display.unitCostCents)}
        </span>
        /unit · {pricing.vendor} ·{" "}
        {new Date(pricing.purchasedAt).toLocaleDateString()}
      </p>
      {suggestedPriceCents === null ? null : (
        <p className="flex items-center gap-2">
          <span>
            Suggest{" "}
            <span className="font-medium text-gray-700">
              {formatCents(suggestedPriceCents)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onUse(suggestedPriceCents)}
            className="rounded border border-primary-300 px-1.5 py-0.5 text-primary-600 hover:bg-primary-50"
          >
            Use {formatCents(suggestedPriceCents)}
          </button>
        </p>
      )}
      {display.marginFraction === null ? null : (
        <p className={display.isUnderTarget ? "text-amber-700" : undefined}>
          At {formatCents(priceCents ?? 0)} you keep{" "}
          {formatSignedCents(display.grossPerUnitCents)} — {formatPercent(display.marginFraction)}{" "}
          margin
          {display.isUnderTarget ? ", under target" : null}
        </p>
      )}
    </div>
  );
}

/** A fraction as a whole percent. Negative when the price is under cost. */
const formatPercent = (fraction: number) => `${Math.round(fraction * 100)}%`;
