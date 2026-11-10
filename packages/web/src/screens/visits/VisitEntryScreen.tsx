import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  type LayoutSlot,
  type RemovalReason,
  type SlotProduct,
  slotProductKey,
} from "@vendpire/domain";
import {
  Alert,
  Button,
  buttonClass,
  Card,
  countInputClass,
  ErrorNote,
  focusRing,
  hintClass,
  inputClass,
  labelClass,
  Page,
  PageTitle,
  buildProductsCell,
  type SlotCell,
  type SlotCellState,
  SlotFaceGrid,
  slotPositionLabel,
} from "../../ui.tsx";
import { queryClient, trpc } from "../../trpc.ts";
import { formatCents } from "../../utils/money.ts";
import {
  ProductCombobox,
  type ProductOption,
} from "../machines/ProductCombobox.tsx";
import { localDateTimeToIso, toLocalDateTimeInput } from "./countedAt.ts";
import {
  buildRestock,
  type Restock,
  restockWithAction,
  restockWithRestUnchanged,
  restockWithSwap,
} from "./restock.ts";
import { RestockSlotPanel } from "./RestockSlotPanel.tsx";
import {
  attentionSlotCodeFor,
  isSlotAnswered,
  nowLevelAfterRestock,
  productIdsAfterRestock,
  restockProgressFor,
  visitWithoutCountRow,
} from "./restockSlots.ts";
import { VisitReview } from "./VisitReview.tsx";
import {
  buildAddedBehindRow,
  buildVisitRows,
  isCounted,
  isSameRow,
  isSlotCounted,
  rowWithBestBy,
  rowWithLeft,
  rowWithRemoved,
  rowWithRemovedReason,
  rowsInSlot,
  rowsWithAddedBehind,
  uncountedSlotCodes,
  type VisitRow,
  warningsFor,
} from "./visitRows.ts";
import { buildVisitSubmission, problemMessage } from "./visitSubmission.ts";

/**
 * Logging one servicing of one machine, from a phone at the machine, in three
 * steps: Count (what was in each slot on arrival), Restock (what was done to
 * each product), Review (then Save).
 *
 * "Left in slot" is a PRE-FILL observation and nothing downstream can detect a
 * violation: enter a post-fill count and every sold figure, every revenue
 * number and every profit line is silently garbage, with no error raised
 * anywhere. That's why Count asks for nothing that's loaded in.
 */
export function VisitEntryScreen({ machineId }: { machineId: string }) {
  // "Log another visit" REMOUNTS the form rather than resetting its state, so
  // clientRequestId and countedAt are minted fresh. Reusing the key would make
  // the second visit look like a retry of the first, and the server would
  // idempotently return the original and store nothing.
  const [attempt, setAttempt] = useState(0);
  return (
    <VisitDraftForm
      key={attempt}
      machineId={machineId}
      onLogAnother={() => setAttempt((count) => count + 1)}
    />
  );
}

const REMOVAL_REASONS: { value: RemovalReason; label: string }[] = [
  { value: "expired", label: "Expired — binned" },
  { value: "damaged", label: "Damaged — binned" },
  { value: "recalled", label: "Recalled — binned" },
  { value: "destocked", label: "Destocked — back to the van" },
  { value: "transferred", label: "Transferred to another machine" },
];

type VisitStep = "count" | "restock" | "review";

const VISIT_STEPS: { step: VisitStep; label: string }[] = [
  { step: "count", label: "Count" },
  { step: "restock", label: "Restock" },
  { step: "review", label: "Review" },
];

function VisitDraftForm({
  machineId,
  onLogAnother,
}: {
  machineId: string;
  onLogAnother: () => void;
}) {
  // Minted at form OPEN, not at submit: a submit whose response was lost is
  // retried with the same key and cannot double-post.
  const [clientRequestId] = useState(() => crypto.randomUUID());
  const [countedAtInput, setCountedAtInput] = useState(() =>
    toLocalDateTimeInput(new Date().toISOString()),
  );
  const [rows, setRows] = useState<VisitRow[]>([]);
  const [restock, setRestock] = useState<Restock | null>(null);
  const [isBuilt, setIsBuilt] = useState(false);
  const [step, setStep] = useState<VisitStep>("count");
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedLineCount, setSavedLineCount] = useState<number | null>(null);
  // The day the warnings are judged against. Fixed at form open so a visit
  // spanning midnight cannot reclassify rows mid-count.
  const [asOf] = useState(() => new Date().toISOString().slice(0, 10));

  const machine = useQuery(trpc.machines.get.queryOptions({ id: machineId }));
  const planogram = useQuery(
    trpc.planograms.getCurrent.queryOptions({ machineId }),
  );
  const products = useQuery(trpc.products.list.queryOptions());
  const previousVisits = useQuery(
    trpc.visits.list.queryOptions({ machineId, limit: 1 }),
  );

  // Built ONCE. These queries refetch on window focus, and rebuilding would
  // wipe counts already typed in — the one thing this screen must never do.
  useEffect(() => {
    if (isBuilt || !machine.data || !planogram.isSuccess) {
      return;
    }
    if (!previousVisits.isSuccess || !products.isSuccess) {
      return;
    }
    const built = buildVisitRows({
      shelves: machine.data.slots,
      planogramSlots: planogram.data?.slots ?? [],
      previousVisit: previousVisits.data[0] ?? null,
      products: products.data,
    });
    setRows(built);
    setRestock(buildRestock({ shelves: machine.data.slots, rows: built }));
    setSelected(built[0]?.slotCode ?? null);
    setIsBuilt(true);
  }, [
    isBuilt,
    machine.data,
    planogram.isSuccess,
    planogram.data,
    previousVisits.isSuccess,
    previousVisits.data,
    products.isSuccess,
    products.data,
  ]);

  const create = useMutation(
    trpc.visits.create.mutationOptions({
      onSuccess: (visit) => {
        queryClient.invalidateQueries({ queryKey: trpc.visits.list.pathKey() });
        queryClient.invalidateQueries({ queryKey: trpc.pnl.pathKey() });
        setSavedLineCount(visit.lines.length);
        setError(null);
      },
      onError: (e) => setError(e.message),
    }),
  );

  const productName = (id: string): string =>
    products.data?.find((product) => product.id === id)?.name ?? id;

  const replaceRow = (next: VisitRow) =>
    setRows(rows.map((row) => (isSameRow(row, next) ? next : row)));

  // Unknown products keep asking for a date, as in buildVisitRows.
  const tracksExpirationOf = (productId: string): boolean =>
    products.data?.find((product) => product.id === productId)
      ?.tracksExpiration ?? true;

  const addBehind = ({ slotCode, productId }: SlotProduct) => {
    const [front] = rowsInSlot(rows, slotCode);
    if (!front) {
      return;
    }
    const added = buildAddedBehindRow({
      front,
      productId,
      tracksExpiration: tracksExpirationOf(productId),
    });
    setRows(rowsWithAddedBehind(rows, added));
  };

  const showCountSlot = (slotCode: string) => {
    setSelected(slotCode);
    setStep("count");
  };

  const removeAdded = (removed: VisitRow) => {
    if (!restock) {
      return;
    }
    const next = visitWithoutCountRow({ rows, restock, removed });
    setRows(next.rows);
    setRestock(next.restock);
  };

  const clearAnswer = (key: SlotProduct) => {
    const row = rows.find(
      (candidate) =>
        candidate.slotCode === key.slotCode &&
        candidate.productId === key.productId,
    );
    if (!restock || !row) {
      return;
    }
    setRestock(restockWithAction(restock, row, null));
  };

  const slotOrder = [...new Set(rows.map((row) => row.slotCode))];
  const uncounted = uncountedSlotCodes(rows);

  const planogramSlots: LayoutSlot[] = (planogram.data?.slots ?? []).map(
    ({ slotCode, productId, par, priceCents }) => ({
      slotCode,
      productId,
      par,
      priceCents,
    }),
  );

  const save = () => {
    setError(null);
    if (!machine.data || !restock) {
      return;
    }
    const countedAt = localDateTimeToIso(countedAtInput);
    if (!countedAt) {
      setError("Set when you counted this machine");
      return;
    }
    const result = buildVisitSubmission({ rows, restock, planogramSlots });
    if ("problems" in result) {
      return;
    }
    create.mutate({
      machineId,
      // The machine's location as the CLIENT saw it. Never re-derived: if the
      // machine moved between the count and the submit, the server's idea of
      // where it stands is the wrong answer for this visit.
      locationId: machine.data.locationId,
      planogramId: planogram.data?.id ?? null,
      countedAt,
      lines: result.submission.lines,
      layoutChanges: result.submission.layoutChanges,
      notes: notes.trim() === "" ? null : notes.trim(),
      clientRequestId,
    });
  };

  const showNextSlot = (slotCode: string) => {
    const index = slotOrder.indexOf(slotCode);
    const next = slotOrder[index + 1];
    if (next === undefined) {
      setStep("restock");
      return;
    }
    setSelected(next);
  };

  const renderCell = (slotCode: string): SlotCell => {
    const slotRows = rowsInSlot(rows, slotCode);
    const products = slotRows.map((row) => ({
      id: row.productId,
      name: productName(row.productId),
    }));
    const [front] = slotRows;
    if (!front) {
      return buildProductsCell({
        slotCode,
        products,
        title: `${slotCode}: not in the current planogram`,
      });
    }
    const isCounted = isSlotCounted(rows, slotCode);
    const hasWarnings = slotRows.some(
      (row) => warningsFor(row, { asOf }).length > 0,
    );
    let state: SlotCellState = "assigned";
    if (hasWarnings) {
      state = "attention";
    } else if (isCounted) {
      state = "done";
    }
    // A mixed cell has no room for per-product counts; its badge says enough.
    let detail: string | null = null;
    if (slotRows.length === 1) {
      detail = isCounted ? `left ${front.left}` : `par ${front.par ?? "—"}`;
    }
    return buildProductsCell({ slotCode, products, detail, state });
  };

  if (savedLineCount !== null) {
    return (
      <Page max="xl" className="flex flex-col gap-4">
        <PageTitle>Visit saved</PageTitle>
        <Alert tone="success" title={`${savedLineCount} slot(s) recorded`}>
          {machine.data?.name ?? "This machine"} is counted. Sold figures and
          profit for the interval that just closed are on the history screen.
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/machines/$machineId/visits"
            params={{ machineId }}
            className={buttonClass({ size: "sm" })}
          >
            View history &amp; P&amp;L
          </Link>
          <Button variant="secondary" size="sm" onClick={onLogAnother}>
            Log another visit
          </Button>
          <Link
            to="/machines"
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            Machines
          </Link>
        </div>
      </Page>
    );
  }

  const hasPlanogram = (planogram.data?.slots.length ?? 0) > 0;

  return (
    <Page max="xl" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <PageTitle>Log Visit</PageTitle>
        <Link
          to="/machines/$machineId/visits"
          params={{ machineId }}
          className="text-sm text-gray-600 hover:text-gray-800"
        >
          History →
        </Link>
      </div>
      <p className="text-sm text-gray-600">{machine.data?.name ?? "…"}</p>

      <ErrorNote message={error} />

      {machine.isSuccess && !hasPlanogram ? (
        <Alert tone="warning" title="This machine has no planogram yet">
          A visit records what was in each slot at the price it was selling for,
          so the slots need products and prices first.{" "}
          <Link
            to="/machines/$machineId/planograms"
            params={{ machineId }}
            className="font-bold underline"
          >
            Set up the planogram
          </Link>
          .
        </Alert>
      ) : null}

      {rows.length > 0 && restock ? (
        <>
          <VisitStepBar step={step} onSelect={setStep} />

          {step === "count" ? (
            <>
              <SlotFaceGrid
                shelves={machine.data?.slots ?? []}
                renderCell={renderCell}
                selectedCode={selected}
                onSelect={setSelected}
              />

              <p className="text-sm text-gray-600 tabular-nums">
                {slotOrder.length - uncounted.length} of {slotOrder.length}{" "}
                slots counted
              </p>

              {selected ? (
                <SlotCountPanel
                  key={selected}
                  slotRows={rowsInSlot(rows, selected)}
                  nameOf={productName}
                  products={products.data ?? []}
                  asOf={asOf}
                  isLastSlot={slotOrder[slotOrder.length - 1] === selected}
                  onChange={replaceRow}
                  onAddBehind={(productId) =>
                    addBehind({ slotCode: selected, productId })
                  }
                  onRemoveAdded={removeAdded}
                  onNext={() => showNextSlot(selected)}
                />
              ) : null}
            </>
          ) : null}

          {step === "restock" ? (
            <RestockStep
              shelves={machine.data?.slots ?? []}
              rows={rows}
              restock={restock}
              planogramSlots={planogramSlots}
              selected={selected}
              nameOf={productName}
              tracksExpirationOf={tracksExpirationOf}
              products={products.data ?? []}
              onSelect={setSelected}
              onRestockChange={setRestock}
              onCountSlot={showCountSlot}
              onNext={() => setStep("review")}
            />
          ) : null}

          {step === "review" ? (
            <VisitReview
              submissionResult={buildVisitSubmission({
                rows,
                restock,
                planogramSlots,
              })}
              shelves={machine.data?.slots ?? []}
              rows={rows}
              planogramSlots={planogramSlots}
              onShowSlot={({ step: nextStep, slotCode }) => {
                setSelected(slotCode);
                setStep(nextStep);
              }}
              onClearAnswer={clearAnswer}
              uncountedSlotCodes={uncounted}
              productName={productName}
              countedAtInput={countedAtInput}
              onCountedAtInputChange={setCountedAtInput}
              notes={notes}
              onNotesChange={setNotes}
              isSaving={create.isPending}
              onSave={save}
            />
          ) : null}
        </>
      ) : machine.isLoading || planogram.isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : null}
    </Page>
  );
}

/**
 * Count · Restock · Review. Every step stays reachable until the visit is
 * saved, and switching keeps everything typed in each.
 */
function VisitStepBar({
  step,
  onSelect,
}: {
  step: VisitStep;
  onSelect: (step: VisitStep) => void;
}) {
  return (
    <nav className="flex gap-1 border-b border-line" aria-label="Visit steps">
      {VISIT_STEPS.map((item) => (
        <button
          key={item.step}
          type="button"
          onClick={() => onSelect(item.step)}
          aria-current={item.step === step ? "step" : undefined}
          className={`border-b-[3px] px-2.5 pt-2 pb-2.5 text-sm font-bold whitespace-nowrap ${focusRing} ${
            item.step === step
              ? "border-tab-indicator text-tab-active"
              : "border-transparent text-tab hover:text-gray-800"
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

interface SlotPick {
  row: VisitRow;
  isSwap: boolean;
  /** A swap into a mixed slot waits here for which product came back. */
  partnerSlotCode: string | null;
  /** Why the last tap didn't take. */
  notice: string | null;
}

/**
 * The Restock step: the grid shows each slot as it will be after, the panel
 * takes the selected slot's answers, and Moved / Swapped turn the grid into a
 * slot picker until a tap, Cancel or Escape.
 */
function RestockStep({
  shelves,
  rows,
  restock,
  planogramSlots,
  selected,
  nameOf,
  tracksExpirationOf,
  products,
  onSelect,
  onRestockChange,
  onCountSlot,
  onNext,
}: {
  shelves: string[][];
  rows: VisitRow[];
  restock: Restock;
  planogramSlots: LayoutSlot[];
  selected: string | null;
  nameOf: (productId: string) => string;
  tracksExpirationOf: (productId: string) => boolean;
  products: ProductOption[];
  onSelect: (slotCode: string) => void;
  onRestockChange: (next: Restock) => void;
  onCountSlot: (slotCode: string) => void;
  onNext: () => void;
}) {
  const [pick, setPick] = useState<SlotPick | null>(null);

  useEffect(() => {
    if (!pick) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPick(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pick]);

  const result = buildVisitSubmission({ rows, restock, planogramSlots });
  const problems = "problems" in result ? result.problems : [];
  const attentionSlotCodes = new Set(problems.map(attentionSlotCodeFor));
  const slotCodes = shelves.flat();
  const { answeredCount, totalCount } = restockProgressFor({
    rows,
    restock,
    slotCodes,
  });
  const unansweredCount = rows.filter(
    (row) =>
      isCounted(row) && restock.actions[slotProductKey(row)] === undefined,
  ).length;

  const handleSwapPartner = (partner: VisitRow) => {
    if (!pick) {
      return;
    }
    onRestockChange(restockWithSwap(restock, { a: pick.row, b: partner }));
    setPick(null);
  };

  const handlePickSlot = (slotCode: string) => {
    if (!pick || slotCode === pick.row.slotCode) {
      return;
    }
    if (!pick.isSwap) {
      onRestockChange(
        restockWithAction(restock, pick.row, {
          kind: "moved",
          toSlotCode: slotCode,
          isSwap: false,
        }),
      );
      setPick(null);
      return;
    }
    const partners = rowsInSlot(rows, slotCode).filter(isCounted);
    const [onlyPartner] = partners;
    if (!onlyPartner) {
      setPick({
        ...pick,
        partnerSlotCode: null,
        notice: `Nothing counted in ${slotCode} to swap with. Use Moved → instead.`,
      });
      return;
    }
    if (partners.length === 1) {
      handleSwapPartner(onlyPartner);
      return;
    }
    setPick({ ...pick, partnerSlotCode: slotCode, notice: null });
  };

  const renderCell = (slotCode: string): SlotCell => {
    const slot = { rows, restock, slotCode };
    const productIds = productIdsAfterRestock(slot);
    const nowLevel = nowLevelAfterRestock(slot);
    let state: SlotCellState | undefined;
    if (attentionSlotCodes.has(slotCode)) {
      state = "attention";
    } else if (isSlotAnswered(slot)) {
      state = "done";
    }
    return buildProductsCell({
      slotCode,
      products: productIds.map((id) => ({ id, name: nameOf(id) })),
      detail: nowLevel === null ? null : `now ${nowLevel}`,
      state,
    });
  };

  const selectedProblemMessages = selected
    ? [
        ...new Set(
          problems
            .filter((problem) => attentionSlotCodeFor(problem) === selected)
            .map((problem) => problemMessage(problem, nameOf)),
        ),
      ]
    : [];
  const partnerRows = pick?.partnerSlotCode
    ? rowsInSlot(rows, pick.partnerSlotCode).filter(isCounted)
    : [];

  return (
    <>
      {pick ? (
        <Alert
          tone="warning"
          title={
            pick.partnerSlotCode
              ? `Which product in ${pick.partnerSlotCode} came back to ${pick.row.slotCode}?`
              : `Tap the slot ${nameOf(pick.row.productId)} ${pick.isSwap ? "swapped with" : "went to"}`
          }
        >
          {pick.notice ? <span>{pick.notice}</span> : null}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {partnerRows.map((partner) => (
              <Button
                key={partner.productId}
                variant="outline"
                size="sm"
                onClick={() => handleSwapPartner(partner)}
              >
                {nameOf(partner.productId)}
              </Button>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setPick(null)}>
              Cancel
            </Button>
          </div>
        </Alert>
      ) : null}

      <SlotFaceGrid
        shelves={shelves}
        renderCell={renderCell}
        selectedCode={pick ? null : selected}
        onSelect={pick ? handlePickSlot : onSelect}
      />

      {selected ? (
        <RestockSlotPanel
          key={selected}
          slotCode={selected}
          rows={rows}
          restock={restock}
          nameOf={nameOf}
          tracksExpirationOf={tracksExpirationOf}
          products={products}
          problemMessages={selectedProblemMessages}
          pickingRowKey={pick ? slotProductKey(pick.row) : null}
          onRestockChange={onRestockChange}
          onStartPick={(row, { isSwap }) =>
            setPick({ row, isSwap, partnerSlotCode: null, notice: null })
          }
          onCancelPick={() => setPick(null)}
          onCountSlot={() => onCountSlot(selected)}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600 tabular-nums">
          {answeredCount} of {totalCount} slots answered
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              onRestockChange(restockWithRestUnchanged(restock, rows))
            }
            disabled={unansweredCount === 0}
          >
            Mark the rest unchanged, nothing added
          </Button>
          <Button size="sm" onClick={onNext}>
            Review →
          </Button>
        </div>
      </div>
    </>
  );
}

/** One slot: its price once, then a count row per product, front to back. */
function SlotCountPanel({
  slotRows,
  nameOf,
  products,
  asOf,
  isLastSlot,
  onChange,
  onAddBehind,
  onRemoveAdded,
  onNext,
}: {
  slotRows: VisitRow[];
  nameOf: (productId: string) => string;
  products: ProductOption[];
  /** The day expiry warnings are judged against, fixed at form open. */
  asOf: string;
  /** The last slot's Next goes on to Restock. */
  isLastSlot: boolean;
  onChange: (next: VisitRow) => void;
  onAddBehind: (productId: string) => void;
  onRemoveAdded: (row: VisitRow) => void;
  onNext: () => void;
}) {
  const [front] = slotRows;
  if (!front) {
    return null;
  }
  const inSlot = new Set(slotRows.map((row) => row.productId));

  return (
    <Card className="flex flex-col gap-3 border border-primary-200 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm font-bold text-gray-800">
          {front.slotCode}
        </span>
        <span className="text-sm tabular-nums text-body">
          Slot price {formatCents(front.priceCents)}
        </span>
      </div>

      {slotRows.map((row, index) => (
        <ProductCountRow
          key={row.productId}
          row={row}
          productName={nameOf(row.productId)}
          position={
            row.isAddedBehind
              ? "Added behind"
              : slotPositionLabel({ index, count: slotRows.length })
          }
          isFirst={index === 0}
          asOf={asOf}
          onChange={onChange}
          onRemove={row.isAddedBehind ? () => onRemoveAdded(row) : undefined}
        />
      ))}

      <div className="flex flex-col gap-1 border-t border-line pt-3">
        <span className={labelClass}>Add a product behind</span>
        <ProductCombobox
          products={products.filter((product) => !inSlot.has(product.id))}
          productId=""
          onPick={(product) => onAddBehind(product.id)}
        />
        <span className={hintClass}>
          Found in the slot but not in the planogram
        </span>
      </div>

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={onNext}>
          {isLastSlot ? "On to restocking →" : "Next slot →"}
        </Button>
      </div>
    </Card>
  );
}

/**
 * One product's counts. Emits a whole replacement row rather than a patch, so
 * every rule about what a keystroke means stays in `visitRows.ts`.
 */
function ProductCountRow({
  row,
  productName,
  position,
  isFirst,
  asOf,
  onChange,
  onRemove,
}: {
  row: VisitRow;
  productName: string;
  position: string;
  isFirst: boolean;
  asOf: string;
  onChange: (next: VisitRow) => void;
  /** Present only for a product added behind on this visit. */
  onRemove: (() => void) | undefined;
}) {
  const [isRemoving, setIsRemoving] = useState(
    row.removed.trim() !== "" && row.removed !== "0",
  );
  const warnings = warningsFor(row, { asOf });

  return (
    <div
      className={`flex flex-col gap-3 ${isFirst ? "" : "border-t border-line pt-3"}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-gray-800">
          {productName}
        </span>
        <span className="flex shrink-0 items-baseline gap-2 text-xs text-muted">
          {position}
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="text-primary-600 hover:text-primary-500"
            >
              Remove
            </button>
          ) : null}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Left in slot</span>
          <input
            // The front product's Left field takes focus on every slot change,
            // so counting a machine is tap-type-tap rather than tap-tap-type.
            autoFocus={isFirst}
            inputMode="numeric"
            className={countInputClass}
            placeholder="—"
            value={row.left}
            onChange={(e) => onChange(rowWithLeft(row, e.target.value))}
          />
          <span className={hintClass}>
            {row.previousLevel !== null
              ? `Filled to ${row.previousLevel} last visit`
              : row.isAddedBehind
                ? "How many you found in the slot"
                : "Before you refill"}
          </span>
        </label>
      </div>

      {row.tracksExpiration ? (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Best by</span>
          <input
            type="date"
            className={inputClass}
            value={row.bestBy}
            onChange={(e) => onChange(rowWithBestBy(row, e.target.value))}
          />
          <span className={hintClass}>
            {row.previousBestBy === null
              ? "The front item — the one that sells next"
              : `Last visit: ${row.previousBestBy}`}
          </span>
        </label>
      ) : null}

      {isRemoving ? (
        <div className="grid gap-2 rounded-xl bg-gray-50 p-2.5 sm:grid-cols-[6rem_1fr]">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Removed</span>
            <input
              inputMode="numeric"
              className={countInputClass}
              placeholder="0"
              value={row.removed}
              onChange={(e) => onChange(rowWithRemoved(row, e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Why</span>
            <select
              className={inputClass}
              value={row.removedReason ?? ""}
              onChange={(e) =>
                onChange(
                  rowWithRemovedReason(
                    row,
                    e.target.value === ""
                      ? null
                      : (e.target.value as RemovalReason),
                  ),
                )
              }
            >
              <option value="">— choose a reason —</option>
              {REMOVAL_REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
            <span className={hintClass}>
              Decides whether these units are a write-off or still your stock.
            </span>
          </label>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsRemoving(true)}
          className="self-start text-sm text-primary-600 hover:text-primary-500"
        >
          Pulled something out?
        </button>
      )}

      {warnings.length > 0 ? (
        <Alert
          tone="warning"
          title={
            warnings.includes("expired")
              ? "Past its best-by date — pull it"
              : warnings.includes("expiring-soon")
                ? "Expiring soon"
                : "More removed than was in the slot"
          }
        >
          Saved as entered — this is a note, not a block.
        </Alert>
      ) : null}
    </div>
  );
}
