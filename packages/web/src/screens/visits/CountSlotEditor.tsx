import {
  Alert,
  Button,
  Kbd,
  NumberInput,
  RowTable,
  RowTableBody,
  RowTableHeader,
  RowTableRow,
  TextInput,
} from "../../ui.tsx";
import { onEnterKey } from "../../utils/keyboard.ts";
import { formatCents } from "../../utils/money.ts";
import {
  EditorCard,
  EditorFooter,
  EditorNotice,
  PriceLabel,
  SlotEditorHeader,
} from "./SlotEditor.tsx";
import type { VisitTotals } from "./visitActivity.ts";
import {
  type RowWarning,
  rowWithBestBy,
  rowWithLeft,
  type VisitRow,
  warningsFor,
} from "./visitRows.ts";

const WARNING_TEXT: Record<RowWarning, string> = {
  expired: "past its best-by date, pull it",
  "expiring-soon": "expiring soon",
  "over-removed": "more pulled than was in the slot",
};

const COUNT_COLUMNS = "minmax(0,1fr) 168px 196px";

const productSubline = (row: VisitRow): string => {
  const lastVisit =
    row.previousLevel === null
      ? "no previous visit"
      : `filled to ${row.previousLevel} last visit`;
  return row.par === null ? lastVisit : `Par ${row.par} · ${lastVisit}`;
};

/**
 * The Count step's editor for one slot: what was in it on arrival, one row
 * per product. Enter in any field moves on to the next slot, whose first
 * count field takes focus.
 */
export function CountSlotEditor({
  slotCode,
  shelfLabel,
  slotRows,
  sold,
  nameOf,
  asOf,
  isFirstSlot,
  isLastSlot,
  onRowChange,
  onPrevious,
  onNext,
}: {
  slotCode: string;
  shelfLabel: string;
  slotRows: VisitRow[];
  /** Sold since last visit in this slot, from its counts. */
  sold: Pick<VisitTotals, "soldCount" | "revenueCents">;
  nameOf: (productId: string) => string;
  /** The day expiry warnings are judged against, fixed at form open. */
  asOf: string;
  isFirstSlot: boolean;
  isLastSlot: boolean;
  onRowChange: (next: VisitRow) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const [front] = slotRows;
  const isNamed = slotRows.length > 1;
  const warnings = slotRows.flatMap((row) =>
    warningsFor(row, { asOf }).map(
      (warning) => `${isNamed ? `${nameOf(row.productId)}: ` : ""}${WARNING_TEXT[warning]}`,
    ),
  );
  const handleEnter = onEnterKey(onNext);

  return (
    <EditorCard label={`Count slot ${slotCode}`}>
      <SlotEditorHeader
        slotCode={slotCode}
        shelfLabel={shelfLabel}
        productNames={slotRows.map((row) => nameOf(row.productId))}
        price={
          front ? (
            <>
              <PriceLabel>Slot price</PriceLabel>
              <div className="mt-1 font-mono text-2xl font-medium text-ink tabular-nums">
                {formatCents(front.priceCents)}
              </div>
            </>
          ) : null
        }
      />

      {front ? (
        <div className="grid gap-5">
          <RowTable columns={COUNT_COLUMNS} variant="plain" minWidth="520px">
            <RowTableHeader>
              <span>Product</span>
              <span>Found in slot</span>
              <span>
                Best by{" "}
                <span className="font-normal tracking-normal normal-case">· optional</span>
              </span>
            </RowTableHeader>
            <RowTableBody>
              {slotRows.map((row, index) => {
                const name = nameOf(row.productId);
                return (
                  <RowTableRow key={row.productId}>
                    <div className="min-w-0">
                      <div className="text-body font-bold text-ink">{name}</div>
                      <div className="text-body-sm text-muted-strong">{productSubline(row)}</div>
                    </div>
                    <NumberInput
                      size="lg"
                      // The front product's count takes focus on every slot
                      // change, so counting a machine is type-Enter-type.
                      autoFocus={index === 0}
                      aria-label={`Found in slot, ${name}`}
                      placeholder="0"
                      suffix={row.par === null ? undefined : `/ ${row.par}`}
                      value={row.left}
                      onChange={(event) => onRowChange(rowWithLeft(row, event.target.value))}
                      onKeyDown={handleEnter}
                    />
                    {row.tracksExpiration ? (
                      <TextInput
                        type="date"
                        className="h-14"
                        aria-label={`Best by, ${name}`}
                        value={row.bestBy}
                        onChange={(event) => onRowChange(rowWithBestBy(row, event.target.value))}
                        onKeyDown={handleEnter}
                      />
                    ) : (
                      <span className="text-body-sm text-muted-strong">Not tracked</span>
                    )}
                  </RowTableRow>
                );
              })}
            </RowTableBody>
          </RowTable>

          <p className="text-body-sm text-muted-strong">
            Count before pulling or refilling. Best by is the front item, the one
            that sells next.
          </p>

          {warnings.length > 0 ? (
            <Alert tone="warning" title="Needs a look">
              <ul>
                {warnings.map((warning) => (
                  <li key={warning} className="first-letter:uppercase">
                    {warning}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {sold.soldCount === null ? null : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-control border border-divider bg-app px-4 py-3.5">
              <span className="font-display text-stat text-ink tabular-nums">
                {sold.soldCount} sold
              </span>
              <span className="text-body text-ink-soft">
                since last visit · {formatCents(sold.revenueCents)} estimated
              </span>
            </div>
          )}
        </div>
      ) : (
        <EditorNotice>
          Nothing to count, this slot is empty. You can load a product into it during Restock.
        </EditorNotice>
      )}

      <EditorFooter
        hint={
          <>
            <Kbd>Tab</Kbd> next field <Kbd>Enter</Kbd> next slot
          </>
        }
      >
        <Button variant="secondary" onClick={onPrevious} disabled={isFirstSlot}>
          Previous
        </Button>
        <Button onClick={onNext}>{isLastSlot ? "Continue to restock" : "Next slot"} →</Button>
      </EditorFooter>
    </EditorCard>
  );
}
