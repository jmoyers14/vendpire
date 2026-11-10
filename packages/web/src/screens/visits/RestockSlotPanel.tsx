import { slotProductKey } from "@vendpire/domain";
import {
  Alert,
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
import { rowsInSlot, type VisitRow } from "./visitRows.ts";

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
}) {
  const slotRows = rowsInSlot(rows, slotCode);
  const arrivals = arrivalsIn(restock, slotCode);
  const price = restock.prices[slotCode] ?? "";
  const productIdsAfter = new Set(
    productIdsAfterRestock({ rows, restock, slotCode }),
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
          position={
            row.isAddedBehind
              ? "Found behind"
              : slotPositionLabel({ index, count: slotRows.length })
          }
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

      {arrivals.map((arrival) => (
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
        />
      ))}

      <div className="flex flex-col gap-1 border-t border-line pt-3">
        <span className={labelClass}>+ Add product</span>
        <ProductCombobox
          products={products.filter((product) => !productIdsAfter.has(product.id))}
          productId=""
          onPick={(product) => handleAddProduct(product.id)}
        />
        <span className={hintClass}>
          Newly loaded stock. Replacing a product is Moved or Pulled on the old
          one, then this.
        </span>
      </div>
    </Card>
  );
}
