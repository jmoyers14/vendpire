import { inputClass } from "../../ui.tsx";
import type { SplitPart } from "./packSplit.ts";
import { formatCents } from "../../utils/money.ts";
import { isPackRow, type Row } from "./rows.ts";

interface PurchaseLineRowProps {
  row: Row;
  products: { id: string; name: string }[];
  packs: { id: string; name: string }[];
  /** Pack rows only — how the cost will divide. Null while incomplete. */
  split: SplitPart[] | null;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
}

/**
 * One editable line of the receipt. A pack row picks a case and a number of
 * cases; a unit row picks a product and a number of units. Both take one total
 * cost, because that's how a receipt reads.
 */
export function PurchaseLineRow({
  row,
  products,
  packs,
  split,
  onChange,
  onRemove,
}: PurchaseLineRowProps) {
  const isPack = isPackRow(row);
  const productName = (productId: string): string =>
    products.find((product) => product.id === productId)?.name ?? "…";

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[3.5rem_1fr_5rem_7rem_2rem] items-center gap-2">
        <span
          className={`rounded px-1.5 py-0.5 text-center text-[10px] font-medium uppercase ${
            isPack
              ? "bg-primary-100 text-primary-700"
              : "bg-gray-200 text-gray-600"
          }`}
        >
          {isPack ? "Pack" : "Item"}
        </span>

        {isPackRow(row) ? (
          <select
            className={inputClass}
            value={row.packId}
            onChange={(e) => onChange({ packId: e.target.value })}
          >
            <option value="">Pack…</option>
            {packs.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.name}
              </option>
            ))}
          </select>
        ) : (
          <select
            className={inputClass}
            value={row.productId}
            onChange={(e) => onChange({ productId: e.target.value })}
          >
            <option value="">Product…</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        )}

        <input
          className={inputClass}
          placeholder={isPack ? "Packs" : "Units"}
          value={isPackRow(row) ? row.qty : row.units}
          onChange={(e) =>
            onChange(
              isPackRow(row)
                ? { qty: e.target.value }
                : { units: e.target.value },
            )
          }
        />
        <input
          className={inputClass}
          placeholder="Total $"
          value={row.totalCost}
          onChange={(e) => onChange({ totalCost: e.target.value })}
        />
        <button
          type="button"
          onClick={onRemove}
          className="text-gray-400 hover:text-red-600"
          title="Remove line"
        >
          ✕
        </button>
      </div>

      {split ? (
        <p className="pl-[4rem] text-xs text-gray-500">
          ↳ saves as{" "}
          {split
            .map(
              (part) =>
                `${part.units} × ${productName(part.productId)} (${formatCents(part.cents)})`,
            )
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
