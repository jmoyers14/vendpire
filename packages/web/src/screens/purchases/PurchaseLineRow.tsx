import type { ApiPack, ApiProduct } from "../../apiTypes.ts";
import {
  Badge,
  IconButton,
  MoneyInput,
  NumberInput,
  RowTableRow,
  Select,
} from "../../ui.tsx";
import { formatCents } from "../../utils/money.ts";
import type { SplitPart } from "./packSplit.ts";
import {
  isPackRow,
  missingPartsOf,
  perUnitCentsFor,
  type Row,
  recordIdOf,
  unitsIn,
} from "./rows.ts";

/**
 * What a picker needs of each record — the lists also hold entries created
 * mid-entry, which have no server round trip behind them yet.
 */
export type ProductOption = Pick<ApiProduct, "id" | "name">;
export type PackOption = Pick<ApiPack, "id" | "name" | "contents">;

/** Item · Qty · Total paid · Per unit · remove. */
export const PURCHASE_ROW_COLUMNS = "minmax(0,1fr) 128px 140px 104px 40px";

interface PurchaseLineRowProps {
  row: Row;
  products: ProductOption[];
  packs: PackOption[];
  /** Pack rows only — how the cost will divide. Null while incomplete. */
  split: SplitPart[] | null;
  /** Outline what it's missing; off for the row being filled in right now. */
  isShowingMissing: boolean;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
}

/**
 * One line of the receipt. A scanned or searched row shows its product or
 * pack by name; a row added "without a barcode" offers a picker until one is
 * chosen. Both take one total, because that's how a receipt reads.
 */
export function PurchaseLineRow({
  row,
  products,
  packs,
  split,
  isShowingMissing,
  onChange,
  onRemove,
}: PurchaseLineRowProps) {
  const isPack = isPackRow(row);
  const recordId = recordIdOf(row);
  const pack = isPack ? packs.find((candidate) => candidate.id === row.packId) : undefined;
  const unitsPerPack = pack?.contents.reduce((sum, content) => sum + content.units, 0) ?? 0;
  const name = isPack
    ? (pack?.name ?? "")
    : (products.find((product) => product.id === row.productId)?.name ?? "");
  const count = isPack ? row.qty : row.units;
  const perUnitCents = perUnitCentsFor(row, { unitsPerPack });
  const units = unitsIn(row, { unitsPerPack });
  // Not useProductName: `products` includes ones created during this purchase,
  // which the catalog doesn't have yet.
  const productName = (productId: string): string =>
    products.find((product) => product.id === productId)?.name ?? "…";
  const label = name || (isPack ? "new pack" : "new item");
  const missing = missingPartsOf(row);
  const isRecordMissing = isShowingMissing && missing.isRecordMissing;
  const isCountMissing = isShowingMissing && missing.isCountMissing;
  const isTotalMissing = isShowingMissing && missing.isTotalMissing;

  return (
    <RowTableRow>
      <div className="grid min-w-0 gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <Badge size="sm" tone={isPack ? "action" : "neutral"}>
            {isPack ? (unitsPerPack > 0 ? `Pack of ${unitsPerPack}` : "Pack") : "Item"}
          </Badge>
          {recordId === "" ? (
            <div className="min-w-0 flex-1">
              <RecordPicker
                isPack={isPack}
                isMissing={isRecordMissing}
                products={products}
                packs={packs}
                onChange={onChange}
              />
            </div>
          ) : (
            <span className="min-w-0 text-label text-ink">{name || "…"}</span>
          )}
        </div>
        {split ? (
          <span className="text-body-sm text-muted-strong">
            Saves as{" "}
            {split
              .map(
                (part) =>
                  `${part.units} × ${productName(part.productId)} (${formatCents(part.cents)})`,
              )
              .join(" · ")}
          </span>
        ) : null}
      </div>
      <NumberInput
        size="sm"
        aria-label={`Quantity, ${label}`}
        aria-invalid={isCountMissing || undefined}
        placeholder="0"
        suffix={isPack ? (count === "1" ? "pack" : "packs") : "units"}
        value={count}
        onChange={(event) =>
          onChange(isPack ? { qty: event.target.value } : { units: event.target.value })
        }
      />
      <MoneyInput
        size="sm"
        aria-label={`Total paid, ${label}`}
        aria-invalid={isTotalMissing || undefined}
        className="text-right"
        placeholder="0.00"
        value={row.totalCost}
        onChange={(event) => onChange({ totalCost: event.target.value })}
      />
      <span className="text-right font-mono text-mono text-ink tabular-nums">
        {perUnitCents === null ? "—" : formatCents(perUnitCents)}
        {isPack && units !== null && units > 0 ? (
          <span className="block font-sans text-body-sm text-muted-strong">{units} units</span>
        ) : null}
      </span>
      <IconButton label={`Remove ${label}`} tone="danger" onClick={onRemove}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </IconButton>
    </RowTableRow>
  );
}

/** For a row added without a barcode: choose what it is, then it shows by name. */
function RecordPicker({
  isPack,
  isMissing,
  products,
  packs,
  onChange,
}: {
  isPack: boolean;
  isMissing: boolean;
  products: ProductOption[];
  packs: PackOption[];
  onChange: (patch: Partial<Row>) => void;
}) {
  const options = isPack ? packs : products;
  return (
    <Select
      aria-label={isPack ? "Which pack" : "Which product"}
      aria-invalid={isMissing || undefined}
      value=""
      onChange={(event) =>
        onChange(isPack ? { packId: event.target.value } : { productId: event.target.value })
      }
    >
      <option value="">{isPack ? "Choose a pack…" : "Choose a product…"}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </Select>
  );
}
