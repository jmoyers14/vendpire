import { buildPricingDisplay } from "./pricing.ts";
import type { ApiProductPricing } from "../../apiTypes.ts";
import { buttonClass } from "../../ui.tsx";
import {
  formatCents,
  formatPercent,
  formatSignedCents,
} from "../../utils/money.ts";

/**
 * What the product last cost, and what to charge for it — under the price
 * field, where the number is actually set. Absent until the product has been
 * purchased, which is every product on the create form.
 */
export function PricingHint({
  pricing,
  priceCents,
  onUse,
}: {
  pricing: ApiProductPricing | undefined;
  priceCents: number;
  onUse: (cents: number) => void;
}) {
  if (!pricing) {
    return null;
  }

  const {
    unitCostCents,
    suggestedPriceCents,
    marginFraction,
    grossPerUnitCents,
    isUnderTarget,
  } = buildPricingDisplay(pricing, priceCents);

  return (
    <div className="space-y-0.5 pt-1 text-xs text-gray-500">
      <p>
        Last paid{" "}
        <span className="font-medium text-gray-700">
          {formatCents(unitCostCents)}
        </span>
        /unit · {pricing.vendor} ·{" "}
        {new Date(pricing.purchasedAt).toLocaleDateString()}
      </p>
      {suggestedPriceCents !== null ? (
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
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            Use {formatCents(suggestedPriceCents)}
          </button>
        </p>
      ) : null}
      {marginFraction !== null ? (
        <p className={isUnderTarget ? "text-amber-700" : undefined}>
          At {formatCents(priceCents)} you keep{" "}
          {formatSignedCents(grossPerUnitCents)} —{" "}
          {formatPercent(marginFraction)} margin
          {isUnderTarget ? ", under target" : null}
        </p>
      ) : null}
    </div>
  );
}
