import { slotProductKey } from "@vendpire/domain";
import {
  Alert,
  Button,
  Card,
  countInputClass,
  hintClass,
  labelClass,
  slotPositionLabel,
} from "../../ui.tsx";
import {
  ProductCombobox,
  type ProductOption,
} from "../machines/ProductCombobox.tsx";
import { ArrivalRow } from "./ArrivalRow.tsx";
import {
  type Arrival,
  arrivalsIn,
  type Restock,
  restockWithAction,
  restockWithArrivalChange,
  restockWithNewStock,
  restockWithoutNewStock,
  restockWithPrice,
  restockWithSourceLinked,
  suggestedSourcesFor,
} from "./restock.ts";
import { RestockProductRow } from "./RestockProductRow.tsx";
import { productIdsAfterRestock } from "./restockSlots.ts";
import { isCounted, rowsInSlot, type VisitRow } from "./visitRows.ts";

/**
 * One slot in Restock: its price, an action per Count product front to back,
 * then what arrived, then + Add product. Every change goes through a
 * `restockWith*`, so the rules stay in `restock.ts`.
 */
export function RestockSlotPanel({
  slotCode,
  rows,
  restock,
  nameOf,
  tracksExpirationOf,
  products,
  problemMessages,
  pickingRowKey,
  onRestockChange,
  onStartPick,
  onCancelPick,
  onCountSlot,
  isLastSlot,
  onNext,
}: {
  slotCode: string;
  /** Every Count row, not just this slot's: "Came from?" looks elsewhere. */
  rows: readonly VisitRow[];
  restock: Restock;
  nameOf: (productId: string) => string;
  tracksExpirationOf: (productId: string) => boolean;
  products: ProductOption[];
  /** What the submission says is wrong in this slot. */
  problemMessages: readonly string[];
  /** The row waiting for a grid tap, if any. */
  pickingRowKey: string | null;
  onRestockChange: (next: Restock) => void;
  onStartPick: (row: VisitRow, options: { isSwap: boolean }) => void;
  onCancelPick: () => void;
  onCountSlot: () => void;
  /** The last slot's Next goes on to Review. */
  isLastSlot: boolean;
  onNext: () => void;
}) {
  const slotRows = rowsInSlot(rows, slotCode);
  const arrivals = arrivalsIn(restock, slotCode);
  const price = restock.prices[slotCode] ?? "";
  // A product leaving this slot can't come back as new stock: that's one line
  // for the slot and product, so it's Add on the row instead.
  const unofferedProductIds = new Set([
    ...productIdsAfterRestock({ rows, restock, slotCode }),
    ...slotRows.map((row) => row.productId),
  ]);

  const uncountedSourceOf = (arrival: Arrival): VisitRow | undefined =>
    rows.find(
      (row) =>
        row.slotCode === arrival.fromSlotCode &&
        row.productId === arrival.productId &&
        !isCounted(row),
    );

  const handleAddProduct = (productId: string) =>
    onRestockChange(
      restockWithNewStock(restock, {
        slotCode,
        productId,
        tracksExpiration: tracksExpirationOf(productId),
      }),
    );

  return (
    <Card className="flex flex-col gap-3 border border-primary-200 p-3">
      <div className="flex items-end justify-between gap-2">
        <span className="pb-2 font-mono text-sm font-bold text-gray-800">
          {slotCode}
        </span>
        <label className="flex w-28 flex-col gap-1">
          <span className="text-xs font-bold text-gray-800">Price</span>
          <input
            inputMode="decimal"
            className={countInputClass}
            placeholder="$0.00"
            value={price}
            onChange={(e) =>
              onRestockChange(restockWithPrice(restock, slotCode, e.target.value))
            }
          />
        </label>
      </div>

      {problemMessages.length > 0 ? (
        <Alert tone="warning" title="Needs a look">
          <ul className="list-disc pl-5">
            {problemMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {slotRows.length === 0 && arrivals.length === 0 ? (
        <p className={hintClass}>Empty before this visit.</p>
      ) : null}

      {slotRows.map((row, index) => (
        <RestockProductRow
          key={row.productId}
          row={row}
          productName={nameOf(row.productId)}
          position={slotPositionLabel({ index, count: slotRows.length })}
          action={restock.actions[slotProductKey(row)]}
          isPicking={pickingRowKey === slotProductKey(row)}
          isFirst={index === 0}
          onActionChange={(action) =>
            onRestockChange(restockWithAction(restock, row, action))
          }
          onStartPick={(options) => onStartPick(row, options)}
          onCancelPick={onCancelPick}
          onCountSlot={onCountSlot}
        />
      ))}

      {arrivals.map((arrival) => {
        const uncountedSource = uncountedSourceOf(arrival);
        return (
          <ArrivalRow
            key={arrival.productId}
            arrival={arrival}
            productName={nameOf(arrival.productId)}
            suggestedSources={
              arrival.fromSlotCode === null
                ? suggestedSourcesFor(restock, rows, arrival)
                : []
            }
            onChange={(patch) =>
              onRestockChange(restockWithArrivalChange(restock, arrival, patch))
            }
            onSourceLink={(source) =>
              onRestockChange(restockWithSourceLinked(restock, { arrival, source }))
            }
            onRemove={() =>
              onRestockChange(restockWithoutNewStock(restock, arrival))
            }
            onClearSource={
              uncountedSource
                ? () =>
                    onRestockChange(
                      restockWithAction(restock, uncountedSource, null),
                    )
                : undefined
            }
          />
        );
      })}

      <div className="flex flex-col gap-1 border-t border-line pt-3">
        <span className={labelClass}>+ Add product</span>
        <ProductCombobox
          products={products.filter((product) => !unofferedProductIds.has(product.id))}
          productId=""
          onPick={(product) => handleAddProduct(product.id)}
        />
        <span className={hintClass}>
          Newly loaded stock. Replacing a product is Move or Pull on the old
          one, then this.
        </span>
      </div>

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={onNext}>
          {isLastSlot ? "On to review →" : "Next slot →"}
        </Button>
      </div>
    </Card>
  );
}
