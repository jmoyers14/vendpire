import { inject, injectable } from "tsyringe";
import {
  calendarDateToday,
  layoutChangeLineMismatch,
  observationsForVisit,
  slotProductKey,
  slotRuleViolation,
  slotsAfterChanges,
  type LayoutChange,
} from "@vendpire/domain";
import {
  LOCATION_REPOSITORY_TOKEN,
  MACHINE_REPOSITORY_TOKEN,
  PLANOGRAM_REPOSITORY_TOKEN,
  PRODUCT_REPOSITORY_TOKEN,
  VISIT_REPOSITORY_TOKEN,
} from "@vendpire/platform";
import type {
  Location,
  LocationRepository,
  Machine,
  MachineRepository,
  Planogram,
  PlanogramInput,
  PlanogramRepository,
  Product,
  ProductRepository,
  Visit,
  VisitLine,
  VisitListFilter,
  VisitRepository,
} from "@vendpire/platform";
import { isDuplicateKey, ServiceError } from "../errors.ts";
import {
  layoutChangeMessage,
  slotRuleMessage,
} from "../PlanogramService/planogramSlots.ts";
import { buildExpiringReport, type PopulatedVisit } from "./expiringReport.ts";
import {
  DEFAULT_VISIT_LIST_LIMIT,
  type ExpiringReport,
  type ExpiringSoonOptions,
  type VisitCreation,
  type VisitDraft,
  type VisitNotice,
  type VisitService,
  type VisitSubmission,
} from "./VisitService.ts";

/** Slack for drifting phone clocks. Beyond it, a future-stamped visit becomes
 *  the predecessor of every real visit after it and poisons their baselines. */
const MAX_FUTURE_MS = 2 * 60 * 60 * 1000;

/** An already-stored visit handed back for a repeated submit. Logging and
 *  analytics skip it, and it wrote no planogram this time. */
const replayOf = (visit: Visit): VisitCreation => ({
  visit,
  isReplay: true,
  isOutOfOrder: false,
  anomalies: [],
  notices: [],
  planogram: null,
});

const normalizeSlotCode = (slotCode: string): string =>
  slotCode.trim().toUpperCase();

const withNormalizedSlotCodes = (change: LayoutChange): LayoutChange =>
  change.kind === "move"
    ? {
        ...change,
        fromSlotCode: normalizeSlotCode(change.fromSlotCode),
        toSlotCode: normalizeSlotCode(change.toSlotCode),
      }
    : { ...change, slotCode: normalizeSlotCode(change.slotCode) };

/**
 * Visit business rules. Two shapes run through all of them:
 *
 * - References are checked DELETED-TOLERANTLY. A line for a product retired
 *   after the count would 400 forever, and the day's counts would be gone.
 * - Anything that merely looks wrong is REPORTED, never rejected. A 400 on a
 *   submitted count destroys data no retry can recover.
 *
 * NOT a rule: matching each line against a planogram slot. A planogram says what
 * a slot should hold; a visit records what was in it. That check would reject
 * exactly the re-planogram and mixed-spiral counts that matter most.
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
    { draft, recordedByUserId, layoutChanges = [] }: VisitSubmission,
  ): Promise<VisitCreation> {
    // Checked FIRST and returned verbatim — no re-validation. A retrying client
    // can only act on 200 with the original; re-validating would reject an
    // already-stored visit whose product has since been retired.
    const replay = await this.visits.findByClientRequestId(
      orgId,
      draft.clientRequestId,
    );
    if (replay) {
      return replayOf(replay);
    }

    const { lines, notices, machineSlotCodes, currentPlanogram } =
      await this.validate(orgId, draft);
    const stored = { ...draft, lines, recordedByUserId };
    const nextPlanogram =
      layoutChanges.length > 0
        ? this.planogramAfter({
            draft,
            lines,
            layoutChanges,
            current: currentPlanogram,
            machineSlotCodes,
          })
        : null;

    const latest = await this.visits.findLatestByMachine(
      orgId,
      draft.machineId,
    );
    const isOutOfOrder =
      latest !== null &&
      Date.parse(latest.countedAt) > Date.parse(draft.countedAt);

    // The planogram goes first because a visit cannot be undone safely: a
    // soft-deleted visit still holds its clientRequestId, so a retry would
    // replay it as saved. A planogram has no such key.
    const planogram = nextPlanogram
      ? await this.planograms.create(orgId, nextPlanogram)
      : null;

    try {
      const visit = await this.visits.create(orgId, stored);
      return {
        visit,
        isReplay: false,
        isOutOfOrder,
        anomalies: observationsForVisit(visit).anomalies,
        notices,
        planogram,
      };
    } catch (error) {
      if (planogram) {
        await this.planograms.softDelete(orgId, planogram.id);
      }
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
      return replayOf(winner);
    }
  }

  /**
   * The version the visit was counted against, with the layout changes applied,
   * effective from the visit's time. Refuses rather than merging when the
   * planogram moved on, since the operator changed a layout they no longer see.
   */
  private planogramAfter({
    draft,
    lines,
    layoutChanges,
    current,
    machineSlotCodes,
  }: {
    draft: VisitDraft;
    lines: VisitLine[];
    layoutChanges: LayoutChange[];
    current: Planogram | null;
    machineSlotCodes: ReadonlySet<string>;
  }): PlanogramInput {
    if (!current) {
      throw new ServiceError(
        "BAD_REQUEST",
        "This visit has no planogram for its layout and price changes to apply to",
      );
    }
    if (draft.planogramId !== current.id) {
      throw new ServiceError(
        "CONFLICT",
        "The planogram changed after this visit was started. Reload and enter its layout and price changes again.",
      );
    }
    if (Date.parse(draft.countedAt) <= Date.parse(current.effectiveFrom)) {
      throw new ServiceError(
        "CONFLICT",
        "The planogram changed after this visit's date, so its layout and price changes can't be saved from it. Save the visit without them and change the planogram instead.",
      );
    }

    const changes = layoutChanges.map(withNormalizedSlotCodes);
    const mismatch = layoutChangeLineMismatch(changes, lines);
    if (mismatch) {
      throw new ServiceError("BAD_REQUEST", layoutChangeMessage(mismatch));
    }
    const applied = slotsAfterChanges(current.slots, changes);
    if ("violation" in applied) {
      throw new ServiceError("BAD_REQUEST", layoutChangeMessage(applied.violation));
    }
    const { slots } = applied;
    const violation = slotRuleViolation(slots, machineSlotCodes);
    if (violation) {
      throw new ServiceError("BAD_REQUEST", slotRuleMessage(violation));
    }
    return {
      machineId: draft.machineId,
      // Normalized, so a client's "+00:00" orders the same as every other "Z".
      effectiveFrom: new Date(draft.countedAt).toISOString(),
      slots,
    };
  }

  async remove(orgId: string, id: string): Promise<void> {
    await this.visits.softDelete(orgId, id);
  }

  async expiringSoon(
    orgId: string,
    options: ExpiringSoonOptions,
  ): Promise<ExpiringReport> {
    const asOf = options.asOf ?? calendarDateToday();
    const visits = await this.loadLatestVisitPerMachine(orgId);
    return buildExpiringReport(visits, {
      asOf,
      withinDays: options.withinDays,
    });
  }

  private async loadLatestVisitPerMachine(
    orgId: string,
  ): Promise<PopulatedVisit[]> {
    const latestVisits = await this.visits.findLatestByOrg(orgId);
    if (latestVisits.length === 0) {
      return [];
    }

    const [machineById, locationById, productById] = await Promise.all([
      this.loadMachinesById(orgId),
      this.loadLocationsById(orgId),
      this.loadProductsById(orgId, latestVisits),
    ]);

    const populated: PopulatedVisit[] = [];
    for (const visit of latestVisits) {
      const machine = machineById.get(visit.machineId);
      if (!machine) {
        continue;
      }
      populated.push({
        visit,
        machine,
        location: locationById.get(visit.locationId) ?? null,
        productById,
      });
    }
    return populated;
  }

  private async loadMachinesById(
    orgId: string,
  ): Promise<Map<string, Machine>> {
    const machines = await this.machines.findByOrg(orgId);
    return new Map(machines.map((machine) => [machine.id, machine]));
  }

  private async loadLocationsById(
    orgId: string,
  ): Promise<Map<string, Location>> {
    const locations = await this.locations.findByOrg(orgId);
    return new Map(locations.map((location) => [location.id, location]));
  }

  /**
   * Deleted-tolerant: a retired product still sitting in a machine is exactly
   * the stock most likely to go bad, so its row must not vanish.
   */
  private async loadProductsById(
    orgId: string,
    visits: readonly Visit[],
  ): Promise<Map<string, Product>> {
    const products = await this.products.findByIdsIncludingDeleted(
      orgId,
      this.productIdsIn(visits),
    );
    return new Map(products.map((product) => [product.id, product]));
  }

  /** Every product these visits reference, each id once. */
  private productIdsIn(visits: readonly Visit[]): string[] {
    return [
      ...new Set(
        visits.flatMap((visit) => visit.lines.map((line) => line.productId)),
      ),
    ];
  }

  /** Throws on what makes a visit unstorable, returns what merely deserves
   *  mentioning, plus the normalized lines to store. */
  private async validate(
    orgId: string,
    draft: VisitDraft,
  ): Promise<{
    lines: VisitLine[];
    notices: VisitNotice[];
    machineSlotCodes: Set<string>;
    /** Read only when the draft names a planogram. */
    currentPlanogram: Planogram | null;
  }> {
    if (Date.parse(draft.countedAt) > Date.now() + MAX_FUTURE_MS) {
      throw new ServiceError(
        "BAD_REQUEST",
        "countedAt is too far in the future",
      );
    }

    const machine = await this.machines.findByIdIncludingDeleted(
      orgId,
      draft.machineId,
    );
    if (!machine) {
      throw new ServiceError("BAD_REQUEST", "Machine does not exist");
    }

    // Matching `normalizeSlots`. A visit stored as "a1" would never key-match
    // the same slot counted as "A1", so the engine would report both as
    // uncounted forever.
    const lines = draft.lines.map((line) => ({
      ...line,
      slotCode: normalizeSlotCode(line.slotCode),
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
      // The PAIR, not the slot code. One slot with two products is how a mixed
      // spiral records per-flavor counts, and how a re-planogram visit counts
      // the outgoing product out.
      const key = slotProductKey(line);
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
    // The client's snapshot wins: counted at 9am, machine moved at 2pm, synced
    // at 5pm — reading machine.locationId would file it at the new location.
    if (location.id !== machine.locationId) {
      notices.push({
        kind: "machine-moved",
        submittedLocationId: location.id,
        machineLocationId: machine.locationId,
      });
    }

    let currentPlanogram: Planogram | null = null;
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
      // Provenance only — price and par are copied onto the line, so the engine
      // never reads a planogram. A fill against a superseded version is real.
      currentPlanogram = versions[0] ?? null;
      if (currentPlanogram && currentPlanogram.id !== draft.planogramId) {
        notices.push({
          kind: "stale-planogram",
          submittedPlanogramId: draft.planogramId,
          currentPlanogramId: currentPlanogram.id,
        });
      }
    }

    return { lines, notices, machineSlotCodes, currentPlanogram };
  }
}
