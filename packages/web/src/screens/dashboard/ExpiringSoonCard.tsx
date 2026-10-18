import { useQuery } from "@tanstack/react-query";
import { Card, CardTitle } from "../../ui.tsx";
import { trpc } from "../../trpc.ts";

/**
 * What to load before the next trip. Reads the latest visit per machine, so it
 * is only ever as current as the last time each machine was counted — which is
 * the right answer: stock only gets older between visits.
 */
export function ExpiringSoonCard() {
  const report = useQuery(trpc.visits.expiringSoon.queryOptions({}));

  if (report.isLoading) {
    return (
      <Card className="p-3">
        <p className="text-gray-500">Checking what&apos;s expiring...</p>
      </Card>
    );
  }
  if (report.isError) {
    return (
      <Card className="p-3">
        <p className="text-red-600">
          Couldn&apos;t load the expiry report: {report.error.message}
        </p>
      </Card>
    );
  }

  const data = report.data;
  if (!data) {
    return null;
  }
  const actionable = [...data.expired, ...data.expiringSoon];

  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <CardTitle>Expiring soon</CardTitle>
        <span className="text-xs text-gray-500">
          next {data.withinDays} days
        </span>
      </div>

      {actionable.length === 0 ? (
        <p className="text-sm text-gray-600">
          Nothing expiring in the next {data.withinDays} days.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {actionable.map((slot) => (
            <li
              key={`${slot.machineId} ${slot.slotCode} ${slot.productId}`}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="truncate">
                <span className="font-mono text-xs text-muted">
                  {slot.slotCode}
                </span>{" "}
                <span className="text-body">{slot.productName}</span>{" "}
                <span className="text-gray-500">
                  · {slot.locationName} / {slot.machineName}
                </span>
              </span>
              <span
                className={
                  slot.daysUntil !== null && slot.daysUntil < 0
                    ? "shrink-0 font-medium text-loss"
                    : "shrink-0 text-amber-700"
                }
              >
                {slot.units} ·{" "}
                {slot.daysUntil !== null && slot.daysUntil < 0
                  ? `EXPIRED ${slot.bestBy}`
                  : `${slot.bestBy} · ${slot.daysUntil}d`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Rendered even when both lists above are empty — that combination is
          precisely the one that would otherwise read as "all clear". */}
      {data.missingDates.length > 0 ? (
        <p className="border-divider border-t pt-2 text-xs text-gray-500">
          No date on file for {data.missingDates.length} stocked slot
          {data.missingDates.length === 1 ? "" : "s"} — they aren&apos;t counted
          above.
        </p>
      ) : null}
    </Card>
  );
}
