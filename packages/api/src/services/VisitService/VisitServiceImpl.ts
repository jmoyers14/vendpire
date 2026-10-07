import { inject, injectable } from "tsyringe";
import {
  buildCostBasis,
  buildIntervalPnl,
  buildPnlTotals,
  intervalsForMachine,
  observationsForVisit,
} from "@vendpire/domain";
import type { VisitAnomaly } from "@vendpire/domain";
import {
  LOCATION_REPOSITORY_TOKEN,
  MACHINE_REPOSITORY_TOKEN,
  PLANOGRAM_REPOSITORY_TOKEN,
  PRODUCT_REPOSITORY_TOKEN,
  PURCHASE_REPOSITORY_TOKEN,
  VISIT_REPOSITORY_TOKEN,
} from "@vendpire/platform";
import type {
  LocationRepository,
  MachineRepository,
  PlanogramRepository,
  ProductRepository,
  PurchaseRepository,
  Visit,
  VisitLine,
  VisitListFilter,
  VisitRange,
  VisitRepository,
} from "@vendpire/platform";
import { ServiceError } from "../errors.ts";
import {
  DEFAULT_VISIT_LIST_LIMIT,
  type VisitCreation,
  type VisitDraft,
  type VisitNotice,
  type VisitPnl,
  type VisitService,
  type VisitSubmission,
} from "./VisitService.ts";

/**
 * How far ahead of the server's clock a count may be stamped. Phone clocks drift
 * and timezones get mishandled, so a little slack is kinder than a rejection.
 * Beyond it, a visit stamped in the future becomes the predecessor of every real
 * visit after it and poisons their baselines until somebody notices.
 */
const MAX_FUTURE_MS = 2 * 60 * 60 * 1000;

/** Mongo's duplicate-key error, recognized without importing a driver type. */
const isDuplicateKey = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: unknown }).code === 11000;

/**
 * Visit business rules.
 *
 * Two shapes run through every one of them. References are validated
 * DELETED-TOLERANTLY: if the phone's store has product P, someone retires P in
 * the dashboard, and the outbox submits a line for P hours later, a live-only
 * existence check would 400 permanently and the day's counts would be gone. The
 * question is "is this a document in this org", not "is it still in the catalog".
 *
 * And anything that merely looks wrong is REPORTED, never rejected. A visit
 * records what happened in the field; a 400 on a submitted count destroys data
 * no retry can recover.
 *
 * Explicitly NOT a rule: requiring each line's (slotCode, productId) to match a
 * planogram slot. A planogram says what a slot is supposed to hold; a visit
 * records what was actually in it. The obvious validation here is the wrong one,
 * and it would reject exactly the re-planogram and mixed-spiral counts that
 * matter most.
 */
@injectable()
export class VisitServiceImpl implements VisitService {
  constructor(
    @inject(VISIT_REPOSITORY_TOKEN)
    private readonly visits: VisitRepository,
    @inject(MACHINE_REPOSITORY_TOKEN)
    private readonly machines: MachineRepository,
    @inject(LOCATION_REPOSITORY_TOKEN)
    private readonly locations: LocationRepository,
    @inject(PRODUCT_REPOSITORY_TOKEN)
    private readonly products: ProductRepository,
    @inject(PLANOGRAM_REPOSITORY_TOKEN)
    private readonly planograms: PlanogramRepository,
    @inject(PURCHASE_REPOSITORY_TOKEN)
    private readonly purchases: PurchaseRepository,
  ) {}

  list(orgId: string, filter: VisitListFilter): Promise<Visit[]> {
    return this.visits.findByOrg(orgId, {
      ...filter,
      limit: filter.limit ?? DEFAULT_VISIT_LIST_LIMIT,
    });
  }

  listLatestByOrg(orgId: string): Promise<Visit[]> {
    return this.visits.findLatestByOrg(orgId);
  }

  get(orgId: string, id: string): Promise<Visit | null> {
    return this.visits.findById(orgId, id);
  }

  async create(
    orgId: string,
    { draft, recordedByUserId }: VisitSubmission,
  ): Promise<VisitCreation> {
    // The replay, checked FIRST and returned verbatim: no re-validation, no
    // update. A client whose request timed out cannot tell "succeeded, response
    // lost" from "failed", so it retries, and 200 with the original is the only
    // answer it can act on. A 409 would make an outbox either drop the draft or
    // retry forever, and re-validating risks rejecting a visit that is already
    // stored because a product has since been retired.
    const replay = await this.visits.findByClientRequestId(
      orgId,
      draft.clientRequestId,
    );
    if (replay) {
      return {
        visit: replay,
        isReplay: true,
        isOutOfOrder: false,
        anomalies: [],
        notices: [],
      };
    }

    const { lines, notices } = await this.validate(orgId, draft);
    const stored = { ...draft, lines, recordedByUserId };

    const latest = await this.visits.findLatestByMachine(orgId, draft.machineId);
    const isOutOfOrder =
      latest !== null &&
      Date.parse(latest.countedAt) > Date.parse(draft.countedAt);

    try {
      const visit = await this.visits.create(orgId, stored);
      return {
        visit,
        isReplay: false,
        isOutOfOrder,
        anomalies: observationsForVisit(visit).anomalies,
        notices,
      };
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }
      // Two submits of one draft raced past the read above. The unique index is
      // what actually enforces idempotency; the read is only the cheap path.
      const winner = await this.visits.findByClientRequestId(
        orgId,
        draft.clientRequestId,
      );
      if (!winner) {
        // Some other unique index rejected this, so it is not ours to swallow.
        throw error;
      }
      return {
        visit: winner,
        isReplay: true,
        isOutOfOrder: false,
        anomalies: [],
        notices: [],
      };
    }
  }

  async remove(orgId: string, id: string): Promise<void> {
    await this.visits.softDelete(orgId, id);
  }

  async pnl(
    orgId: string,
    machineId: string,
    range: VisitRange = {},
  ): Promise<VisitPnl> {
    const visits = await this.visits.findByMachineAscending(
      orgId,
      machineId,
      range,
    );
    const engine = intervalsForMachine(visits);

    // findByMachineAscending prepends the visit strictly BEFORE the window, so
    // the window's first interval has something to measure against. That visit
    // belongs to the previous period, and everything it contributes has to come
    // back out or a month report opens by declaring the whole machine face
    // uncounted.
    const baseline = this.baselineOf(visits, range);
    const opensAfter = baseline ? Date.parse(baseline.countedAt) : null;

    const intervals =
      opensAfter === null
        ? engine.intervals
        : // Filtered on `to`, never on `from === to`: a product introduced
          // mid-period is also from === to, and dropping those would hide the
          // new products a period report exists to mention.
          engine.intervals.filter((row) => Date.parse(row.to) > opensAfter);
    const removals =
      opensAfter === null
        ? engine.removals
        : engine.removals.filter(
            (row) => Date.parse(row.countedAt) > opensAfter,
          );
    const anomalies =
      baseline === null
        ? engine.anomalies
        : withoutAnomaliesOf(engine.anomalies, baseline);

    // All-time and org-wide, every call. The weighted average IS all-time, so
    // there is nothing to window, and a receipt entered three weeks late has to
    // be able to correct the COGS of a visit that predates it.
    const costLines = await this.purchases.findCostBasisLines(orgId);
    const priced = buildIntervalPnl(
      intervals,
      removals,
      buildCostBasis(costLines),
    );

    return {
      machineId,
      from: range.from ?? null,
      to: range.to ?? null,
      rows: priced.rows,
      totals: buildPnlTotals(priced.rows),
      anomalies: [...anomalies, ...priced.anomalies],
    };
  }

  /**
   * The out-of-window baseline, when there is one. Identified by its timestamp
   * rather than its position: with no `from` there is no baseline at all, and the
   * window's own first visit must not be mistaken for one.
   */
  private baselineOf(visits: Visit[], range: VisitRange): Visit | null {
    const first = visits[0];
    if (!range.from || !first) {
      return null;
    }
    return Date.parse(first.countedAt) < Date.parse(range.from) ? first : null;
  }

  /**
   * Every reference check, plus the normalized lines to store. Throws on what
   * makes a visit unstorable; returns what merely deserves mentioning.
   */
  private async validate(
    orgId: string,
    draft: VisitDraft,
  ): Promise<{ lines: VisitLine[]; notices: VisitNotice[] }> {
    if (Date.parse(draft.countedAt) > Date.now() + MAX_FUTURE_MS) {
      throw new ServiceError("BAD_REQUEST", "countedAt is too far in the future");
    }

    const machine = await this.machines.findByIdIncludingDeleted(
      orgId,
      draft.machineId,
    );
    if (!machine) {
      throw new ServiceError("BAD_REQUEST", "Machine does not exist");
    }

    // Stored slot codes are trimmed and uppercased (see `normalizeSlots`), so
    // incoming ones must be too. A visit stored as "a1" would not merely fail
    // the check below: it would never key-match the same slot counted as "A1",
    // and the engine would report both as uncounted forever.
    const lines = draft.lines.map((line) => ({
      ...line,
      slotCode: line.slotCode.trim().toUpperCase(),
    }));

    const machineSlotCodes = new Set(machine.slots.flat());
    const seen = new Set<string>();
    for (const line of lines) {
      if (!machineSlotCodes.has(line.slotCode)) {
        throw new ServiceError(
          "BAD_REQUEST",
          `Machine has no slot ${line.slotCode}`,
        );
      }
      // The PAIR, not the slot code. A repeated slotCode with a different
      // product is legal and load-bearing: it is how a mixed spiral records
      // per-flavor counts, and how a re-planogram visit counts the outgoing
      // product out alongside the incoming one.
      const key = `${line.slotCode} ${line.productId}`;
      if (seen.has(key)) {
        throw new ServiceError(
          "BAD_REQUEST",
          `Duplicate line for slot ${line.slotCode} and product ${line.productId}`,
        );
      }
      seen.add(key);
    }

    const productIds = [...new Set(lines.map((line) => line.productId))];
    const existing = await this.products.findExistingIdsIncludingDeleted(
      orgId,
      productIds,
    );
    const missing = productIds.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      throw new ServiceError(
        "BAD_REQUEST",
        `Unknown product(s): ${missing.join(", ")}`,
      );
    }

    const notices: VisitNotice[] = [];

    const location = await this.locations.findByIdIncludingDeleted(
      orgId,
      draft.locationId,
    );
    if (!location) {
      throw new ServiceError("BAD_REQUEST", "Location does not exist");
    }
    // The client's snapshot wins. The phone counted at 9am where the machine
    // then stood, someone moved it at 2pm, the outbox submits at 5pm: reading
    // machine.locationId here would file the count at the new location.
    if (location.id !== machine.locationId) {
      notices.push({
        kind: "machine-moved",
        submittedLocationId: location.id,
        machineLocationId: machine.locationId,
      });
    }

    if (draft.planogramId) {
      // Newest first, so the head is the current version.
      const versions = await this.planograms.findByMachine(
        orgId,
        draft.machineId,
      );
      if (!versions.some((version) => version.id === draft.planogramId)) {
        throw new ServiceError(
          "BAD_REQUEST",
          "Planogram does not exist for this machine",
        );
      }
      // Provenance only: the engine never reads a planogram, because price and
      // par are copied onto the line. Filling against a superseded version is a
      // real event, so it is noted and stored rather than refused.
      const current = versions[0];
      if (current && current.id !== draft.planogramId) {
        notices.push({
          kind: "stale-planogram",
          submittedPlanogramId: draft.planogramId,
          currentPlanogramId: current.id,
        });
      }
    }

    return { lines, notices };
  }
}

/**
 * The full run's anomalies, less the ones the baseline visit contributes.
 *
 * Anomalies carry no timestamp, so unlike intervals and removals they cannot be
 * filtered by date. Running the engine over the baseline ALONE reproduces exactly
 * what it contributes as index 0 of the full sequence — a `no-baseline` per line
 * plus its own single-visit checks — so subtracting that multiset drops them
 * without re-deriving any of the arithmetic here.
 *
 * Keyed by JSON because both lists are built by the same code from the same
 * fields, so key order is identical. A multiset and not a set: two slots can
 * legitimately raise the same anomaly, and only as many copies as the baseline
 * actually produced may come out.
 */
const withoutAnomaliesOf = (
  all: VisitAnomaly[],
  baseline: Visit,
): VisitAnomaly[] => {
  const removable = new Map<string, number>();
  for (const anomaly of intervalsForMachine([baseline]).anomalies) {
    const key = JSON.stringify(anomaly);
    removable.set(key, (removable.get(key) ?? 0) + 1);
  }

  return all.filter((anomaly) => {
    const key = JSON.stringify(anomaly);
    const count = removable.get(key) ?? 0;
    if (count === 0) {
      return true;
    }
    removable.set(key, count - 1);
    return false;
  });
};
