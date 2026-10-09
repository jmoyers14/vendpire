import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { RemovalReason } from "@vendpire/domain";
import {
  Alert,
  Button,
  buttonClass,
  Card,
  countInputClass,
  ErrorNote,
  hintClass,
  inputClass,
  labelClass,
  Page,
  PageTitle,
  type SlotCell,
  SlotFaceGrid,
} from "../../ui.tsx";
import { queryClient, trpc } from "../../trpc.ts";
import { localDateTimeToIso, toLocalDateTimeInput } from "./countedAt.ts";
import {
  buildVisitLines,
  buildVisitRows,
  isCounted,
  levelOf,
  rowWithAdded,
  rowWithLeft,
  rowWithRemoved,
  rowWithRemovedReason,
  type VisitRow,
  warningsFor,
} from "./visitRows.ts";

/**
 * Logging one servicing of one machine, from a phone at the machine.
 *
 * The two inputs per slot are "Left in slot" and "Added" — never "count".
 * `remaining` is a PRE-FILL observation and nothing downstream can detect a
 * violation: enter a post-fill count and every sold figure, every revenue
 * number and every profit line is silently garbage, with no error raised
 * anywhere.
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
  const [isBuilt, setIsBuilt] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uncountedWarning, setUncountedWarning] = useState<string | null>(null);
  const [savedLineCount, setSavedLineCount] = useState<number | null>(null);

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
    if (!previousVisits.isSuccess) {
      return;
    }
    const built = buildVisitRows({
      shelves: machine.data.slots,
      planogramSlots: planogram.data?.slots ?? [],
      previousVisit: previousVisits.data[0] ?? null,
    });
    setRows(built);
    setSelected(built[0]?.slotCode ?? null);
    setIsBuilt(true);
  }, [
    isBuilt,
    machine.data,
    planogram.isSuccess,
    planogram.data,
    previousVisits.isSuccess,
    previousVisits.data,
  ]);

  const create = useMutation(
    trpc.visits.create.mutationOptions({
      onSuccess: (visit) => {
        queryClient.invalidateQueries({ queryKey: trpc.visits.list.pathKey() });
        queryClient.invalidateQueries({ queryKey: trpc.visits.pnl.pathKey() });
        setSavedLineCount(visit.lines.length);
        setError(null);
        setUncountedWarning(null);
      },
      onError: (e) => setError(e.message),
    }),
  );

  const productName = (id: string): string =>
    products.data?.find((product) => product.id === id)?.name ?? id;

  const rowOf = (slotCode: string): VisitRow | undefined =>
    rows.find((row) => row.slotCode === slotCode);

  const replaceRow = (next: VisitRow) =>
    setRows(rows.map((row) => (row.slotCode === next.slotCode ? next : row)));

  const uncounted = rows.filter((row) => !isCounted(row));

  const submit = ({ allowUncounted = false } = {}) => {
    setError(null);
    setUncountedWarning(null);
    if (!machine.data) {
      return;
    }
    const countedAt = localDateTimeToIso(countedAtInput);
    if (!countedAt) {
      setError("Set when you counted this machine");
      return;
    }
    const result = buildVisitLines(rows);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    if (uncounted.length > 0 && !allowUncounted) {
      setUncountedWarning(
        `${uncounted.length} slot(s) weren't counted: ${uncounted
          .map((row) => row.slotCode)
          .join(", ")}.`,
      );
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
      lines: result.lines,
      notes: notes.trim() === "" ? null : notes.trim(),
      clientRequestId,
    });
  };

  const renderCell = (slotCode: string): SlotCell => {
    const row = rowOf(slotCode);
    if (!row) {
      return {
        state: "empty",
        title: `${slotCode}: not in the current planogram`,
        content: (
          <>
            <div className="font-mono text-[10px] text-muted">{slotCode}</div>
            <div className="text-[10px] text-gray-400">—</div>
          </>
        ),
      };
    }
    const counted = isCounted(row);
    const warnings = warningsFor(row);
    return {
      state: warnings.length > 0 ? "attention" : counted ? "done" : "assigned",
      title: `${slotCode}: ${productName(row.productId)}`,
      content: (
        <>
          <div className="font-mono text-[10px] text-muted">{slotCode}</div>
          <div className="truncate text-[11px] font-medium text-gray-800">
            {productName(row.productId)}
          </div>
          <div className="text-[10px] tabular-nums text-gray-600">
            {counted
              ? `left ${row.left} · +${row.added || "0"}`
              : `par ${row.par ?? "—"}`}
          </div>
        </>
      ),
    };
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

  const selectedRow = selected ? rowOf(selected) : undefined;
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

      {rows.length > 0 ? (
        <>
          <SlotFaceGrid
            shelves={machine.data?.slots ?? []}
            renderCell={renderCell}
            selectedCode={selected}
            onSelect={setSelected}
          />

          <p className="text-sm text-gray-600 tabular-nums">
            {rows.length - uncounted.length} of {rows.length} slots counted
          </p>

          {selectedRow ? (
            <SlotCountPanel
              key={selectedRow.slotCode}
              row={selectedRow}
              productName={productName(selectedRow.productId)}
              onChange={replaceRow}
              onNext={() => {
                const order = rows.map((row) => row.slotCode);
                const index = order.indexOf(selectedRow.slotCode);
                setSelected(order[(index + 1) % order.length] ?? null);
              }}
            />
          ) : null}

          <Card className="flex flex-col gap-3 p-3">
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Counted at</span>
              <input
                type="datetime-local"
                className={countInputClass}
                value={countedAtInput}
                onChange={(e) => setCountedAtInput(e.target.value)}
              />
              <span className={hintClass}>
                When you stood at the machine — this orders every interval the
                engine computes. Back-date it if you're entering this later.
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Notes</span>
              <textarea
                className={inputClass}
                rows={2}
                placeholder="Jammed coil, cold deck warm, …"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </Card>

          {uncountedWarning ? (
            <Alert tone="warning" title={uncountedWarning}>
              <p>
                An uncounted slot gets no line at all, so the engine reports it
                as not counted rather than inventing a sold figure. That's
                correct — but those slots will show no sales for this interval.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => submit({ allowUncounted: true })}
                  disabled={create.isPending}
                >
                  Save anyway
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setUncountedWarning(null)}
                >
                  Keep counting
                </Button>
              </div>
            </Alert>
          ) : null}

          <Button
            full
            onClick={() => submit()}
            disabled={create.isPending || uncountedWarning !== null}
          >
            {create.isPending ? "Saving…" : "Save Visit"}
          </Button>
        </>
      ) : machine.isLoading || planogram.isLoading ? (
        <p className="text-gray-400">Loading…</p>
      ) : null}
    </Page>
  );
}

/**
 * One slot's counts. Emits a whole replacement row rather than a patch, so
 * every rule about what a keystroke means — the fill-to-par default, and when
 * it stops applying — stays in `visitRows.ts` and out of this component.
 */
function SlotCountPanel({
  row,
  productName,
  onChange,
  onNext,
}: {
  row: VisitRow;
  productName: string;
  onChange: (next: VisitRow) => void;
  onNext: () => void;
}) {
  const [isRemoving, setIsRemoving] = useState(
    row.removed.trim() !== "" && row.removed !== "0",
  );
  const level = levelOf(row);
  const warnings = warningsFor(row);

  return (
    <Card className="flex flex-col gap-3 border border-primary-200 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm font-bold text-gray-800">
          {row.slotCode}
        </span>
        <span className="truncate text-sm text-body">{productName}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Left in slot</span>
          <input
            // Focused on every slot change: tapping a cell should put the
            // cursor straight in the one field every slot needs, so counting a
            // machine is tap-type-tap rather than tap-tap-type.
            autoFocus
            inputMode="numeric"
            className={countInputClass}
            placeholder="—"
            value={row.left}
            onChange={(e) => onChange(rowWithLeft(row, e.target.value))}
          />
          <span className={hintClass}>
            {row.previousLevel === null
              ? "Before you refill"
              : `Filled to ${row.previousLevel} last visit`}
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>Added</span>
          <input
            inputMode="numeric"
            className={countInputClass}
            placeholder="—"
            value={row.added}
            onChange={(e) => onChange(rowWithAdded(row, e.target.value))}
          />
          <span className={hintClass}>
            {row.par === null ? "Units loaded in" : `Fill to par ${row.par}`}
          </span>
        </label>
      </div>

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
            warnings.includes("over-removed")
              ? "More removed than was in the slot"
              : `Filled past par ${row.par}`
          }
        >
          Saved as entered — this is a note, not a block.
        </Alert>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-gray-600 tabular-nums">
          {level === null
            ? "Walks away with —"
            : `Walks away with ${level}${row.par === null ? "" : ` / par ${row.par}`}`}
        </span>
        <Button variant="secondary" size="sm" onClick={onNext}>
          Next slot →
        </Button>
      </div>
    </Card>
  );
}
