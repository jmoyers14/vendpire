import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type LayoutSlot, type SlotProduct, slotProductKey } from "@vendpire/domain";
import { type KeyboardEvent, useEffect, useState } from "react";
import type { ApiPlanogram, ApiProduct } from "../../apiTypes.ts";
import { queryClient, trpc } from "../../trpc.ts";
import { shelfLabel } from "../../ui/machineMap.ts";
import {
  Alert,
  Button,
  buttonClass,
  ErrorNote,
  eyebrowLinkClass,
  type MachineTile,
  Page,
  PageHeader,
  pageLinkClass,
  type Step,
  Stepper,
} from "../../ui.tsx";
import { formatShortDate } from "../../utils/dates.ts";
import { plural } from "../../utils/text.ts";
import { MachineMetaLine, useLocationName } from "../machines/machineMeta.tsx";
import { CountSlotEditor } from "./CountSlotEditor.tsx";
import { localDateTimeToIso, toLocalDateTimeInput } from "./countedAt.ts";
import { type RestockPanel, RestockSlotEditor, type SlotPick } from "./RestockSlotEditor.tsx";
import {
  buildRestock,
  type Restock,
  restockWithAction,
  restockWithRestUnchanged,
  restockWithSwap,
} from "./restock.ts";
import {
  attentionSlotCodeFor,
  hasRestockQuestions,
  nextRestockSlotCode,
  previousRestockSlotCode,
  restockProgressFor,
} from "./restockSlots.ts";
import { VisitMapPane } from "./VisitMapPane.tsx";
import { VisitReview } from "./VisitReview.tsx";
import { slotActivityFor, visitActivityFor, visitTotalsFor } from "./visitActivity.ts";
import {
  buildVisitRows,
  isCounted,
  isSameRow,
  rowsInSlot,
  uncountedSlotCodes,
  type VisitRow,
} from "./visitRows.ts";
import { buildVisitSubmission, problemMessage } from "./visitSubmission.ts";
import { countTileFor, restockTileFor } from "./visitTiles.ts";

/**
 * Logging one servicing of one machine in three steps: Count (what was in each
 * slot on arrival), Restock (what was done to each product), Review (then
 * Save). The machine map stays on the left; the right edits one slot.
 *
 * "Found in slot" is a PRE-FILL observation and nothing downstream can detect a
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

type VisitStep = "count" | "restock" | "review";

/** Loads the machine, builds the visit's rows once, and shows the result of a save. */
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
  const [initial, setInitial] = useState<{ rows: VisitRow[]; restock: Restock } | null>(
    null,
  );
  const [savedLineCount, setSavedLineCount] = useState<number | null>(null);

  const machine = useQuery(trpc.machines.get.queryOptions({ id: machineId }));
  const planogram = useQuery(trpc.planograms.getCurrent.queryOptions({ machineId }));
  const products = useQuery(trpc.products.list.queryOptions());
  const previousVisits = useQuery(trpc.visits.list.queryOptions({ machineId, limit: 1 }));
  const locationName = useLocationName(machine.data);

  // Built ONCE. These queries refetch on window focus, and rebuilding would
  // wipe counts already typed in — the one thing this screen must never do.
  useEffect(() => {
    if (initial || !machine.data || !planogram.isSuccess) {
      return;
    }
    if (!previousVisits.isSuccess || !products.isSuccess) {
      return;
    }
    const rows = buildVisitRows({
      shelves: machine.data.slots,
      planogramSlots: planogram.data?.slots ?? [],
      previousVisit: previousVisits.data[0] ?? null,
      products: products.data,
    });
    setInitial({ rows, restock: buildRestock({ shelves: machine.data.slots, rows }) });
  }, [
    initial,
    machine.data,
    planogram.isSuccess,
    planogram.data,
    previousVisits.isSuccess,
    previousVisits.data,
    products.isSuccess,
    products.data,
  ]);

  const shelves = machine.data?.slots ?? [];
  const lastVisitAt = previousVisits.data?.[0]?.countedAt;
  const details = lastVisitAt ? `Last visit ${formatShortDate(lastVisitAt)}` : "First visit";
  const meta = <MachineMetaLine locationName={locationName} details={details} />;

  const header = (
    <PageHeader
      eyebrow={
        <>
          <Link to="/machines" className={eyebrowLinkClass}>
            Machines
          </Link>{" "}
          / Log visit
        </>
      }
      title={machine.data?.name ?? "…"}
      meta={machine.data ? meta : undefined}
      aside={
        <Link to="/machines/$machineId/visits" params={{ machineId }} className={pageLinkClass}>
          History →
        </Link>
      }
    />
  );

  if (savedLineCount !== null) {
    return (
      <Page max="wide" className="grid gap-6">
        {header}
        <Alert
          tone="success"
          title={`Visit saved · ${plural(savedLineCount, { one: "slot", many: "slots" })} recorded`}
        >
          Sold figures and profit for the interval that just closed are on the
          history screen.
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Link to="/machines/$machineId/visits" params={{ machineId }} className={buttonClass()}>
            View history &amp; P&amp;L
          </Link>
          <Button variant="secondary" onClick={onLogAnother}>
            Log another visit
          </Button>
          <Link to="/machines" className={buttonClass({ variant: "secondary" })}>
            Machines
          </Link>
        </div>
      </Page>
    );
  }

  const hasPlanogram = (planogram.data?.slots.length ?? 0) > 0;

  return (
    <Page max="wide" className="grid gap-6">
      {header}
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
      {initial && initial.rows.length > 0 && machine.data ? (
        <VisitFlow
          machineId={machineId}
          locationId={machine.data.locationId}
          shelves={shelves}
          initialRows={initial.rows}
          initialRestock={initial.restock}
          products={products.data ?? []}
          planogram={planogram.data ?? null}
          clientRequestId={clientRequestId}
          onSaved={setSavedLineCount}
        />
      ) : machine.isLoading || planogram.isLoading ? (
        <p className="text-body text-muted-strong">Loading…</p>
      ) : null}
    </Page>
  );
}

/**
 * Stepper, map and slot editor for a visit whose rows are built. Owns the
 * visit being entered; the form above remounts it for "Log another visit".
 */
function VisitFlow({
  machineId,
  locationId,
  shelves,
  initialRows,
  initialRestock,
  products,
  planogram,
  clientRequestId,
  onSaved,
}: {
  machineId: string;
  locationId: string;
  shelves: string[][];
  initialRows: VisitRow[];
  initialRestock: Restock;
  products: ApiProduct[];
  planogram: ApiPlanogram | null;
  clientRequestId: string;
  onSaved: (lineCount: number) => void;
}) {
  const [rows, setRows] = useState(initialRows);
  const [restock, setRestock] = useState(initialRestock);
  const [step, setStep] = useState<VisitStep>("count");
  const [selected, setSelected] = useState<string | null>(initialRows[0]?.slotCode ?? null);
  const [pick, setPick] = useState<SlotPick | null>(null);
  // The inset open in the Restock editor. Moving to another slot or step closes it.
  const [panel, setPanel] = useState<RestockPanel | null>(null);
  const [countedAtInput, setCountedAtInput] = useState(() =>
    toLocalDateTimeInput(new Date().toISOString()),
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The day the warnings are judged against. Fixed at form open so a visit
  // spanning midnight cannot reclassify rows mid-count.
  const [asOf] = useState(() => new Date().toISOString().slice(0, 10));

  const create = useMutation(
    trpc.visits.create.mutationOptions({
      onSuccess: (visit) => {
        queryClient.invalidateQueries({ queryKey: trpc.visits.list.pathKey() });
        queryClient.invalidateQueries({ queryKey: trpc.pnl.pathKey() });
        onSaved(visit.lines.length);
      },
      onError: (e) => setError(e.message),
    }),
  );

  const planogramSlots: LayoutSlot[] = (planogram?.slots ?? []).map(
    ({ slotCode, productId, par, priceCents }) => ({ slotCode, productId, par, priceCents }),
  );
  const slotCodes = shelves.flat();
  const productById = new Map(products.map((product) => [product.id, product]));
  const nameOf = (id: string): string => productById.get(id)?.name ?? id;
  // Unknown products keep asking for a date, as in buildVisitRows.
  const tracksExpirationOf = (productId: string): boolean =>
    productById.get(productId)?.tracksExpiration ?? true;
  const shelfLabelOf = (slotCode: string): string => {
    const index = shelves.findIndex((shelf) => shelf.includes(slotCode));
    return index < 0 ? "" : shelfLabel(shelves[index] ?? [], index);
  };

  const countSlotCodes = slotCodes.filter((code) => rowsInSlot(rows, code).length > 0);
  const uncounted = uncountedSlotCodes(rows);
  const restockSlotCodes = slotCodes.filter((slotCode) =>
    hasRestockQuestions({ rows, restock, slotCode }),
  );
  const { answeredCount, totalCount } = restockProgressFor({ rows, restock, slotCodes });
  const unansweredSlotCount = totalCount - answeredCount;
  const isEverySlotAnswered = totalCount > 0 && unansweredSlotCount === 0;
  const submissionResult = buildVisitSubmission({ rows, restock, planogramSlots });
  const problems = "problems" in submissionResult ? submissionResult.problems : [];
  const attentionSlotCodes = new Set(problems.map(attentionSlotCodeFor));
  const hasUnansweredProduct = rows.some(
    (row) => isCounted(row) && restock.actions[slotProductKey(row)] === undefined,
  );

  // Functional, so several row edits in one handler (Undo) all land.
  const replaceRow = (next: VisitRow) =>
    setRows((current) => current.map((row) => (isSameRow(row, next) ? next : row)));

  /** Every move to another slot or step: drops any pending Move / Swap and open panel. */
  const goTo = ({
    step: nextStep = step,
    slotCode = selected,
  }: {
    step?: VisitStep;
    slotCode?: string | null;
  }) => {
    setPick(null);
    setPanel(null);
    setStep(nextStep);
    setSelected(slotCode);
  };

  const selectSlot = (slotCode: string | null) => goTo({ slotCode });

  const showStep = (next: VisitStep) => {
    const needsRestockSlot =
      next === "restock" && (selected === null || !restockSlotCodes.includes(selected));
    goTo({
      step: next,
      slotCode: needsRestockSlot
        ? nextRestockSlotCode({ rows, restock, slotCodes, afterSlotCode: null })
        : selected,
    });
  };

  const showSlot = ({ step: nextStep, slotCode }: { step: VisitStep; slotCode: string }) =>
    goTo({ step: nextStep, slotCode });

  // Count walks every slot with products in it.
  const countIndex = selected === null ? -1 : countSlotCodes.indexOf(selected);
  const showNextCountSlot = () => {
    const next = countSlotCodes[countIndex + 1];
    if (next === undefined) {
      showStep("restock");
      return;
    }
    selectSlot(next);
  };

  // Restock walks only the slots with something to answer.
  const previousRestockCode =
    selected === null
      ? null
      : previousRestockSlotCode({ rows, restock, slotCodes, beforeSlotCode: selected });
  const nextRestockCode = nextRestockSlotCode({
    rows,
    restock,
    slotCodes,
    afterSlotCode: selected,
  });

  const handleSwapPartner = (partner: VisitRow) => {
    if (!pick) {
      return;
    }
    setRestock(restockWithSwap(restock, { a: pick.row, b: partner }));
    setPick(null);
  };

  const handlePickSlot = (slotCode: string) => {
    if (!pick || slotCode === pick.row.slotCode) {
      return;
    }
    if (!pick.isSwap) {
      setRestock(
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
        notice: `Nothing counted in ${slotCode} to swap with. Use Move instead.`,
      });
      return;
    }
    if (partners.length === 1) {
      handleSwapPartner(onlyPartner);
      return;
    }
    setPick({ ...pick, partnerSlotCode: slotCode, notice: null });
  };

  const handleMapSelect = (slotCode: string) => {
    if (pick) {
      handlePickSlot(slotCode);
      return;
    }
    if (step === "review") {
      showSlot({ step: "restock", slotCode });
      return;
    }
    selectSlot(slotCode);
  };

  // Escape cancels a pending Move / Swap from anywhere inside the flow,
  // without a listener on the whole window.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && pick) {
      setPick(null);
    }
  };

  const tileFor = (slotCode: string): MachineTile => {
    if (step === "count") {
      return countTileFor({ rows, slotCode, nameOf });
    }
    const tile = restockTileFor({
      rows,
      restock,
      slotCode,
      nameOf,
      needsAttention: attentionSlotCodes.has(slotCode),
    });
    if (!pick) {
      return tile;
    }
    const isSource = slotCode === pick.row.slotCode;
    return { ...tile, isSource, isTarget: !isSource };
  };

  const pickBanner = (() => {
    if (!pick) {
      return null;
    }
    const from = pick.row.slotCode;
    if (pick.partnerSlotCode) {
      return `Which product in ${pick.partnerSlotCode} came back to ${from}?`;
    }
    return pick.isSwap ? `Pick the slot to swap with ${from}` : `Pick the slot ${from} moved to`;
  })();

  const statusOf = (id: VisitStep, { isComplete }: { isComplete: boolean }) => {
    if (id === step) {
      return "current" as const;
    }
    return isComplete ? ("done" as const) : ("upcoming" as const);
  };
  const steps: Step<VisitStep>[] = [
    {
      id: "count",
      label: "Count",
      detail: `${countSlotCodes.length - uncounted.length} of ${countSlotCodes.length} counted`,
      status: statusOf("count", { isComplete: uncounted.length === 0 }),
    },
    {
      id: "restock",
      label: "Restock",
      detail: `${answeredCount} of ${totalCount} answered`,
      status: statusOf("restock", { isComplete: isEverySlotAnswered }),
    },
    {
      id: "review",
      label: "Review",
      detail: "Check and save",
      status: statusOf("review", { isComplete: false }),
    },
  ];

  const save = () => {
    setError(null);
    const countedAt = localDateTimeToIso(countedAtInput);
    if (!countedAt) {
      setError("Set when you counted this machine");
      return;
    }
    if ("problems" in submissionResult) {
      return;
    }
    create.mutate({
      machineId,
      // The machine's location as the CLIENT saw it. Never re-derived: if the
      // machine moved between the count and the submit, the server's idea of
      // where it stands is the wrong answer for this visit.
      locationId,
      planogramId: planogram?.id ?? null,
      countedAt,
      lines: submissionResult.submission.lines,
      layoutChanges: submissionResult.submission.layoutChanges,
      notes: notes.trim() === "" ? null : notes.trim(),
      clientRequestId,
    });
  };

  const markRestUnchanged = () => setRestock(restockWithRestUnchanged(restock, rows));

  const clearAnswer = (key: SlotProduct) => {
    const row = rows.find(
      (candidate) =>
        candidate.slotCode === key.slotCode && candidate.productId === key.productId,
    );
    if (row) {
      setRestock(restockWithAction(restock, row, null));
    }
  };

  const selectedProblemMessages =
    selected === null
      ? []
      : [
          ...new Set(
            problems
              .filter((problem) => attentionSlotCodeFor(problem) === selected)
              .map((problem) => problemMessage(problem, nameOf)),
          ),
        ];

  const countedSlotCount = countSlotCodes.length - uncounted.length;

  return (
    <div className="grid gap-6" onKeyDown={handleKeyDown}>
      {step === "review" ? null : <ErrorNote message={error} />}
      <Stepper label="Visit steps" steps={steps} onSelect={showStep} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <VisitMapPane
          step={step}
          shelves={shelves}
          tileFor={tileFor}
          selectedCode={step === "review" || pick ? null : selected}
          onSelect={handleMapSelect}
          progress={
            step === "count"
              ? { done: countedSlotCount, total: countSlotCodes.length }
              : { done: answeredCount, total: totalCount }
          }
          pickBanner={pickBanner ? { text: pickBanner, onCancel: () => setPick(null) } : null}
          onMarkRestUnchanged={
            step === "restock" && hasUnansweredProduct ? markRestUnchanged : null
          }
        />

        {step === "count" && selected ? (
          <CountSlotEditor
            key={selected}
            slotCode={selected}
            shelfLabel={shelfLabelOf(selected)}
            slotRows={rowsInSlot(rows, selected)}
            sold={visitTotalsFor(slotActivityFor({ rows, restock, slotCode: selected }))}
            nameOf={nameOf}
            asOf={asOf}
            isFirstSlot={countIndex <= 0}
            isLastSlot={countIndex === countSlotCodes.length - 1}
            onRowChange={replaceRow}
            onPrevious={() => selectSlot(countSlotCodes[countIndex - 1] ?? selected)}
            onNext={showNextCountSlot}
          />
        ) : null}

        {step === "restock" && selected ? (
          <RestockSlotEditor
            key={selected}
            slotCode={selected}
            shelfLabel={shelfLabelOf(selected)}
            rows={rows}
            restock={restock}
            nameOf={nameOf}
            tracksExpirationOf={tracksExpirationOf}
            products={products}
            problemMessages={selectedProblemMessages}
            pick={pick}
            panel={panel}
            onPanelChange={setPanel}
            isFirstSlot={previousRestockCode === null}
            isLastSlot={nextRestockCode === null}
            isEverySlotAnswered={isEverySlotAnswered}
            unansweredSlotCount={unansweredSlotCount}
            onRowChange={replaceRow}
            onRestockChange={setRestock}
            onStartPick={(row, { isSwap }) =>
              setPick({ row, isSwap, partnerSlotCode: null, notice: null })
            }
            onCancelPick={() => setPick(null)}
            onSwapPartner={handleSwapPartner}
            onCountSlot={() => showSlot({ step: "count", slotCode: selected })}
            onPrevious={() => selectSlot(previousRestockCode)}
            onNext={() => selectSlot(nextRestockCode)}
            onReview={() => showStep("review")}
          />
        ) : null}

        {step === "review" ? (
          <VisitReview
            submissionResult={submissionResult}
            activities={visitActivityFor({ rows, restock, slotCodes })}
            planogramSlots={planogramSlots}
            productName={nameOf}
            uncountedSlotCodes={uncounted}
            unansweredSlotCount={unansweredSlotCount}
            onShowSlot={showSlot}
            onClearAnswer={clearAnswer}
            onMarkRestUnchanged={markRestUnchanged}
            onBackToRestock={() => showStep("restock")}
            countedAtInput={countedAtInput}
            onCountedAtInputChange={setCountedAtInput}
            notes={notes}
            onNotesChange={setNotes}
            isSaving={create.isPending}
            saveError={error}
            onSave={save}
          />
        ) : null}
      </div>
    </div>
  );
}
