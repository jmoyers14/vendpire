import { injectable } from "tsyringe";
import type { RemovalReason } from "@vendpire/domain";
import { VisitModel } from "../../models/Visit.ts";
import type {
  Visit,
  VisitInput,
  VisitListFilter,
  VisitRange,
  VisitRepository,
} from "./VisitRepository.ts";

type VisitDoc = {
  _id: unknown;
  machineId: string;
  locationId: string;
  planogramId?: string | null;
  countedAt: Date;
  recordedByUserId: string;
  lines: {
    slotCode: string;
    productId: string;
    remaining: number;
    added: number;
    removed?: number | null;
    removedReason?: RemovalReason | null;
    priceCents: number;
    par?: number | null;
  }[];
  notes?: string | null;
  clientRequestId: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * The total order the calculation engine requires. countedAt alone is not a
 * total order — two machines on one route get stamped the same minute, and an
 * outbox submitting a backlog can replay several visits at the same instant —
 * so createdAt and _id break the tie deterministically. Without a stable
 * tiebreaker two reads of the same data can pair visits differently and
 * produce two different sold figures for the same interval.
 */
const ASCENDING = { countedAt: 1, createdAt: 1, _id: 1 } as const;

/** Same order reversed, for the "newest" and "predecessor" single-doc reads. */
const DESCENDING = { countedAt: -1, createdAt: -1, _id: -1 } as const;

/**
 * Filter for the org-wide visit list. Exported for unit testing: there is no
 * Mongo harness at this layer, and an accidentally-bounded range or a dropped
 * `deletedAt` is invisible until someone's history goes missing.
 */
export function visitListFilter(
  orgId: string,
  filter: VisitListFilter = {},
): Record<string, unknown> {
  const query: Record<string, unknown> = { orgId, deletedAt: null };
  if (filter.machineId) {
    query.machineId = filter.machineId;
  }
  const range = countedAtRange(filter);
  if (range) {
    query.countedAt = range;
  }
  return query;
}

/**
 * Filter for one machine's window. Note what is NOT here: the predecessor.
 * `from` bounds the window inclusively, and the visit before it is fetched by
 * a separate read — see `findByMachineAscending`.
 */
export function visitWindowFilter(
  orgId: string,
  machineId: string,
  range: VisitRange = {},
): Record<string, unknown> {
  const query: Record<string, unknown> = {
    orgId,
    machineId,
    deletedAt: null,
  };
  const bounds = countedAtRange(range);
  if (bounds) {
    query.countedAt = bounds;
  }
  return query;
}

/**
 * Filter for the one visit STRICTLY before a window opens — the baseline the
 * window's first interval is measured against. Strictly before, because a
 * visit stamped exactly at `from` is already inside the window.
 */
export function visitPredecessorFilter(
  orgId: string,
  machineId: string,
  from: string,
): Record<string, unknown> {
  return {
    orgId,
    machineId,
    deletedAt: null,
    countedAt: { $lt: new Date(from) },
  };
}

function countedAtRange(range: VisitRange): Record<string, Date> | null {
  const bounds: Record<string, Date> = {};
  if (range.from) {
    bounds.$gte = new Date(range.from);
  }
  if (range.to) {
    bounds.$lte = new Date(range.to);
  }
  return Object.keys(bounds).length > 0 ? bounds : null;
}

@injectable()
export class VisitRepositoryImpl implements VisitRepository {
  async findByOrg(orgId: string, filter: VisitListFilter = {}): Promise<Visit[]> {
    const query = VisitModel.find(visitListFilter(orgId, filter)).sort(DESCENDING);
    if (filter.limit) {
      query.limit(filter.limit);
    }
    const docs = await query.lean<VisitDoc[]>();
    return docs.map(toVisit);
  }

  async findByMachineAscending(
    orgId: string,
    machineId: string,
    range: VisitRange = {},
  ): Promise<Visit[]> {
    const docs = await VisitModel.find(visitWindowFilter(orgId, machineId, range))
      .sort(ASCENDING)
      .lean<VisitDoc[]>();

    // The window's first visit has no in-window predecessor, so on its own it
    // would report `first-visit` and book zero revenue for a real interval.
    // One extra read supplies the baseline; it is NOT part of the window, but
    // the engine needs it present to pair against.
    if (range.from) {
      const previous = await VisitModel.findOne(
        visitPredecessorFilter(orgId, machineId, range.from),
      )
        .sort(DESCENDING)
        .lean<VisitDoc | null>();
      if (previous) {
        return [toVisit(previous), ...docs.map(toVisit)];
      }
    }

    return docs.map(toVisit);
  }

  async findLatestByOrg(orgId: string): Promise<Visit[]> {
    // Newest visit per machine in one pass — the mobile mirror's prior-counts
    // source. Same shape as PlanogramRepository.findCurrentByOrg.
    const docs = await VisitModel.aggregate<VisitDoc>([
      { $match: { orgId, deletedAt: null } },
      { $sort: DESCENDING },
      { $group: { _id: "$machineId", doc: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$doc" } },
    ]);
    return docs.map(toVisit);
  }

  async findLatestByMachine(
    orgId: string,
    machineId: string,
  ): Promise<Visit | null> {
    const doc = await VisitModel.findOne({ orgId, machineId, deletedAt: null })
      .sort(DESCENDING)
      .lean<VisitDoc | null>();
    return doc ? toVisit(doc) : null;
  }

  async findById(orgId: string, id: string): Promise<Visit | null> {
    const doc = await VisitModel.findOne({
      _id: id,
      orgId,
      deletedAt: null,
    }).lean<VisitDoc | null>();
    return doc ? toVisit(doc) : null;
  }

  async findByClientRequestId(
    orgId: string,
    clientRequestId: string,
  ): Promise<Visit | null> {
    const doc = await VisitModel.findOne({
      orgId,
      clientRequestId,
    }).lean<VisitDoc | null>();
    return doc ? toVisit(doc) : null;
  }

  async create(orgId: string, data: VisitInput): Promise<Visit> {
    const doc = await VisitModel.create({ orgId, ...data });
    return toVisit(doc.toObject() as unknown as VisitDoc);
  }

  async softDelete(orgId: string, id: string): Promise<void> {
    await VisitModel.updateOne(
      { _id: id, orgId, deletedAt: null },
      { deletedAt: new Date() },
    );
  }
}

/**
 * Document → entity. Exported and tested directly because the defaults it
 * applies are load-bearing: a line written before `removed` existed has
 * no such field, and `undefined` reaching the engine makes every arithmetic
 * result NaN rather than raising anything.
 */
export function toVisit(doc: VisitDoc): Visit {
  return {
    id: String(doc._id),
    machineId: doc.machineId,
    locationId: doc.locationId,
    planogramId: doc.planogramId ?? null,
    countedAt: doc.countedAt.toISOString(),
    recordedByUserId: doc.recordedByUserId,
    lines: doc.lines.map((line) => ({
      slotCode: line.slotCode,
      productId: line.productId,
      remaining: line.remaining,
      added: line.added,
      removed: line.removed ?? 0,
      removedReason: line.removedReason ?? null,
      priceCents: line.priceCents,
      par: line.par ?? null,
    })),
    notes: doc.notes ?? null,
    clientRequestId: doc.clientRequestId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
