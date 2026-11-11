import { slotProductKey } from "@vendpire/domain";
import { useState } from "react";
import { Alert, Button, ChipGroup, IconButton, MoneyInput } from "../../ui.tsx";
import { onEnterKey } from "../../utils/keyboard.ts";
import { formatCents, parseDollarsToCents } from "../../utils/money.ts";
import { plural } from "../../utils/text.ts";
import type { ProductOption } from "../machines/ProductCombobox.tsx";
import {
  arrivalsIn,
  type Restock,
  restockWithNewStock,
  restockWithoutSlot,
  restockWithPrice,
  restockWithRestUnchanged,
} from "./restock.ts";
import { AddStockPanel, LoadProductPanel, PullPanel } from "./RestockPanels.tsx";
import { isSlotAnswered, stayingRowsIn, unloadableProductIdsFor } from "./restockSlots.ts";
import {
  EditorCard,
  EditorFooter,
  EditorInset,
  EditorNotice,
  PriceLabel,
  SlotEditorHeader,
} from "./SlotEditor.tsx";
import { describeSlotAnswers } from "./visitActivity.ts";
import {
  isCounted,
  leftAfterPull,
  rowsInSlot,
  rowWithRemoved,
  rowWithRemovedReason,
  type VisitRow,
} from "./visitRows.ts";

/** A Move or Swap waiting for its destination on the map. */
export interface SlotPick {
  row: VisitRow;
  isSwap: boolean;
  /** A swap into a mixed slot waits here for which product came back. */
  partnerSlotCode: string | null;
  /** Why the last tap didn't take. */
  notice: string | null;
}

/** The inset open in the Restock editor, if any. */
export type RestockPanel = "add" | "pull" | "choose-move" | "choose-swap" | "load";

/** What the slot needs before any panel opens. */
type SlotView = "uncounted" | "empty" | "actions" | "arrivals" | "settled";

const slotViewFor = ({
  slotRows,
  stayingRows,
  arrivalCount,
}: {
  slotRows: VisitRow[];
  stayingRows: VisitRow[];
  arrivalCount: number;
}): SlotView => {
  if (slotRows.some((row) => !isCounted(row))) {
    return "uncounted";
  }
  if (slotRows.length === 0 && arrivalCount === 0) {
    return "empty";
  }
  if (stayingRows.length > 0) {
    return "actions";
  }
  return arrivalCount > 0 ? "arrivals" : "settled";
};

/**
 * The Restock step's editor for one slot. A slot is answered once every
 * product in it has an action: Add stock, Move, Swap, Pull (taken out) or
 * Nothing changed, plus a Went in for anything loaded or moved in.
 */
export function RestockSlotEditor({
  slotCode,
  shelfLabel,
  rows,
  restock,
  nameOf,
  tracksExpirationOf,
  products,
  problemMessages,
  pick,
  panel,
  isFirstSlot,
  isLastSlot,
  isEverySlotAnswered,
  unansweredSlotCount,
  onPanelChange,
  onRowChange,
  onRestockChange,
  onStartPick,
  onCancelPick,
  onSwapPartner,
  onCountSlot,
  onPrevious,
  onNext,
  onReview,
}: {
  slotCode: string;
  shelfLabel: string;
  /** Every Count row: moves, swaps and "Came from?" look at other slots. */
  rows: readonly VisitRow[];
  restock: Restock;
  nameOf: (productId: string) => string;
  tracksExpirationOf: (productId: string) => boolean;
  products: ProductOption[];
  /** What the submission says is wrong in this slot. */
  problemMessages: readonly string[];
  pick: SlotPick | null;
  panel: RestockPanel | null;
  isFirstSlot: boolean;
  isLastSlot: boolean;
  isEverySlotAnswered: boolean;
  unansweredSlotCount: number;
  onPanelChange: (panel: RestockPanel | null) => void;
  onRowChange: (next: VisitRow) => void;
  onRestockChange: (next: Restock) => void;
  onStartPick: (row: VisitRow, options: { isSwap: boolean }) => void;
  onCancelPick: () => void;
  onSwapPartner: (partner: VisitRow) => void;
  onCountSlot: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onReview: () => void;
}) {
  const [isEditingPrice, setIsEditingPrice] = useState(false);

  const slot = { rows, restock, slotCode };
  const slotRows = rowsInSlot(rows, slotCode);
  const stayingRows = stayingRowsIn(slot);
  const arrivals = arrivalsIn(restock, slotCode);
  const view = slotViewFor({ slotRows, stayingRows, arrivalCount: arrivals.length });
  const isAnswered = isSlotAnswered(slot);
  const answers = describeSlotAnswers({ ...slot, nameOf });
  const isPicking = pick?.row.slotCode === slotCode;
  const isPanelOpen = panel !== null || isPicking;
  const productNames = [
    ...new Set([
      ...slotRows.map((row) => row.productId),
      ...arrivals.map((arrival) => arrival.productId),
    ]),
  ].map(nameOf);
  const price = restock.prices[slotCode] ?? "";
  const priceCents = parseDollarsToCents(price);
  const unloadable = unloadableProductIdsFor(slot);
  const loadableProducts = products.filter(
    (product) => product.active && !unloadable.has(product.id),
  );
  const partnerRows =
    pick?.partnerSlotCode == null
      ? []
      : rowsInSlot(rows, pick.partnerSlotCode).filter(isCounted);

  const handleMoveOrSwap = ({ isSwap }: { isSwap: boolean }) => {
    const [only] = stayingRows;
    if (stayingRows.length === 1 && only) {
      onStartPick(only, { isSwap });
      return;
    }
    onPanelChange(isSwap ? "choose-swap" : "choose-move");
  };

  const handleUndo = () => {
    onPanelChange(null);
    onCancelPick();
    for (const row of slotRows) {
      if (row.removed.trim() !== "") {
        onRowChange(rowWithRemovedReason(rowWithRemoved(row, ""), null));
      }
    }
    onRestockChange(restockWithoutSlot(restock, { rows, slotCode }));
  };

  const handleLoad = (product: ProductOption) => {
    onRestockChange(
      restockWithNewStock(restock, {
        slotCode,
        productId: product.id,
        tracksExpiration: tracksExpirationOf(product.id),
      }),
    );
    onPanelChange("add");
  };

  const subtitle = stayingRows
    .map((row) => {
      const level = `${leftAfterPull(row) ?? "—"}${row.par === null ? "" : ` / ${row.par}`} in slot`;
      return stayingRows.length > 1 ? `${nameOf(row.productId)}: ${level}` : level;
    })
    .join(" · ");

  // One primary in view: an open panel's own button, else the slot's next step.
  const primary = (() => {
    if (isPanelOpen) {
      return null;
    }
    if (isEverySlotAnswered || (isLastSlot && isAnswered)) {
      return "review";
    }
    if (isAnswered || view === "empty" || view === "settled") {
      return "next";
    }
    return "add";
  })();
  const isIdle = !isPanelOpen && view !== "uncounted";

  return (
    <EditorCard label={`Restock slot ${slotCode}`}>
      <SlotEditorHeader
        slotCode={slotCode}
        shelfLabel={shelfLabel}
        productNames={productNames}
        subtitle={subtitle || undefined}
        price={
          <>
            <PriceLabel>Price</PriceLabel>
            {isEditingPrice ? (
              <div className="mt-1 flex items-center justify-end gap-2">
                <div className="w-[120px]">
                  <MoneyInput
                    size="sm"
                    autoFocus
                    aria-label="Price in dollars"
                    className="text-right"
                    value={price}
                    onChange={(event) =>
                      onRestockChange(restockWithPrice(restock, slotCode, event.target.value))
                    }
                    onKeyDown={onEnterKey(() => setIsEditingPrice(false))}
                  />
                </div>
                <Button variant="text" onClick={() => setIsEditingPrice(false)}>
                  Done
                </Button>
              </div>
            ) : (
              <div className="mt-1 flex items-center justify-end gap-1">
                <span className="font-mono text-2xl font-medium text-ink tabular-nums">
                  {priceCents === null ? "—" : formatCents(priceCents)}
                </span>
                <IconButton label="Edit price" onClick={() => setIsEditingPrice(true)}>
                  <PencilIcon />
                </IconButton>
              </div>
            )}
          </>
        }
      />

      {problemMessages.length > 0 ? (
        <Alert tone="warning" title="Needs a look">
          <ul className="list-disc pl-5">
            {problemMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {answers.length > 0 ? (
        <div
          className={`flex items-center justify-between gap-3 rounded-control px-4 py-2.5 text-button ${
            isAnswered ? "bg-success-soft text-success" : "bg-app text-ink-soft"
          }`}
        >
          <span>
            {isAnswered ? "✓ " : ""}
            {answers.join(" · ")}
          </span>
          <Button variant="text" onClick={handleUndo}>
            Undo
          </Button>
        </div>
      ) : null}

      {view === "uncounted" ? (
        <EditorNotice>
          Count this slot before restocking it.
          <Button variant="secondary" onClick={onCountSlot}>
            Count {slotCode}
          </Button>
        </EditorNotice>
      ) : null}

      {isIdle && view === "empty" && panel !== "load" ? (
        <EditorNotice>This slot is empty. Load a product below, or leave it empty.</EditorNotice>
      ) : null}

      {isIdle && view === "actions" ? (
        <div className="grid gap-3">
          <p className="text-body font-bold text-ink">
            {isAnswered ? "Anything else in this slot?" : "What happened in this slot?"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={primary === "add" ? "primary" : "secondary"}
              onClick={() => onPanelChange("add")}
            >
              Add stock
            </Button>
            <Button variant="secondary" onClick={() => handleMoveOrSwap({ isSwap: false })}>
              Move →
            </Button>
            <Button variant="secondary" onClick={() => handleMoveOrSwap({ isSwap: true })}>
              Swap ⇄
            </Button>
            <Button variant="secondary" onClick={() => onPanelChange("pull")}>
              Pull
            </Button>
            {isAnswered ? null : (
              <>
                <span aria-hidden className="mx-2 h-7 w-px bg-line" />
                <Button
                  variant="text"
                  onClick={() => onRestockChange(restockWithRestUnchanged(restock, stayingRows))}
                >
                  Nothing changed
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {isIdle && view === "arrivals" && !isAnswered ? (
        <Button
          variant={primary === "add" ? "primary" : "secondary"}
          className="justify-self-start"
          onClick={() => onPanelChange("add")}
        >
          Enter what went in
        </Button>
      ) : null}

      {panel === "add" ? (
        <AddStockPanel
          slotCode={slotCode}
          rows={rows}
          restock={restock}
          nameOf={nameOf}
          onRestockChange={onRestockChange}
          onDone={() => onPanelChange(null)}
        />
      ) : null}

      {panel === "pull" && view === "actions" ? (
        <PullPanel
          pullableRows={stayingRows}
          restock={restock}
          nameOf={nameOf}
          onRowChange={onRowChange}
          onRestockChange={onRestockChange}
          onDone={() => onPanelChange(null)}
        />
      ) : null}

      {panel === "choose-move" || panel === "choose-swap" ? (
        <EditorInset
          title={`${panel === "choose-move" ? "Move" : "Swap"} from ${slotCode}`}
          onCancel={() => onPanelChange(null)}
        >
          <ChipGroup
            label="Which product?"
            options={stayingRows.map((row) => ({
              value: slotProductKey(row),
              label: nameOf(row.productId),
            }))}
            value={null}
            onChange={(key) => {
              const row = stayingRows.find((candidate) => slotProductKey(candidate) === key);
              if (row) {
                onStartPick(row, { isSwap: panel === "choose-swap" });
                onPanelChange(null);
              }
            }}
          />
        </EditorInset>
      ) : null}

      {isPicking && pick ? (
        <EditorInset
          title={`${pick.isSwap ? "Swap" : "Move"} ${nameOf(pick.row.productId)} ${pick.isSwap ? "with" : "to"} another slot`}
          onCancel={onCancelPick}
        >
          {pick.partnerSlotCode ? (
            <div className="grid gap-2">
              <span className="text-label text-ink">
                Which product in {pick.partnerSlotCode} came back to {slotCode}?
              </span>
              <ChipGroup
                label={`Product from ${pick.partnerSlotCode}`}
                options={partnerRows.map((row) => ({
                  value: row.productId,
                  label: nameOf(row.productId),
                }))}
                value={null}
                onChange={(productId) => {
                  const partner = partnerRows.find((row) => row.productId === productId);
                  if (partner) {
                    onSwapPartner(partner);
                  }
                }}
              />
            </div>
          ) : (
            <p className="text-body-sm text-muted-strong">
              Pick the slot on the machine map. Dashed slots are the ones you can
              choose.
            </p>
          )}
          {pick.notice ? <p className="text-body-sm font-bold text-warning">{pick.notice}</p> : null}
        </EditorInset>
      ) : null}

      {panel === "load" ? (
        <LoadProductPanel
          slotCode={slotCode}
          products={loadableProducts}
          onLoad={handleLoad}
          onCancel={() => onPanelChange(null)}
        />
      ) : null}

      {panel !== "load" && view !== "uncounted" ? (
        <div className="grid justify-items-start gap-1 border-t border-divider pt-5">
          <Button variant="text" onClick={() => onPanelChange("load")}>
            + Load a different product
          </Button>
          <p className="text-body-sm text-muted-strong">
            To replace a product, Move or Pull the old one first.
          </p>
        </div>
      ) : null}

      <EditorFooter
        hint={
          isEverySlotAnswered
            ? "All slots answered"
            : `${plural(unansweredSlotCount, { one: "slot", many: "slots" })} still to answer`
        }
      >
        <Button variant="secondary" onClick={onPrevious} disabled={isFirstSlot}>
          Previous
        </Button>
        {isLastSlot ? null : (
          <Button variant={primary === "next" ? "primary" : "secondary"} onClick={onNext}>
            Next slot →
          </Button>
        )}
        {isEverySlotAnswered || isLastSlot ? (
          <Button variant={primary === "review" ? "primary" : "secondary"} onClick={onReview}>
            Review visit →
          </Button>
        ) : null}
      </EditorFooter>
    </EditorCard>
  );
}

const PencilIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    <path d="M14 6l4 4" />
  </svg>
);
