import { injectable } from "tsyringe";
import { PurchaseModel } from "../../models/Purchase.ts";
import type {
  Purchase,
  PurchaseInput,
  PurchaseListQuery,
  PurchasePage,
  PurchaseRepository,
} from "./PurchaseRepository.ts";

type PurchaseDoc = {
  _id: unknown;
  purchasedAt: Date;
  vendor: string;
  lines: {
    productId: string;
    units: number;
    totalCostCents: number;
    packId?: string | null;
  }[];
  receiptTotalCents?: number | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** The read order. The _id tiebreaker is half the correctness of the cursor. */
const LIST_SORT = { purchasedAt: -1, _id: -1 } as const;

/**
 * The filter for one page. Exported because it IS the correctness story and
 * there is no Mongo harness in unit tests: the $or says "strictly past the
 * cursor position", and its second branch is the only thing standing between a
 * page boundary and rows sharing a purchasedAt being duplicated or skipped.
 *
 * Pure and Mongoose-free — `_id` is handed over as a string and cast by the
 * schema. The service validates the cursor's id is 24-hex before it gets here,
 * so that cast cannot raise a CastError.
 */
export function purchaseListFilter(
  orgId: string,
  query: PurchaseListQuery,
): Record<string, unknown> {
  const filter: Record<string, unknown> = { orgId, deletedAt: null };

  const range: Record<string, Date> = {};
  if (query.from) {
    range.$gte = new Date(query.from);
  }
  if (query.to) {
    range.$lte = new Date(query.to);
  }
  if (Object.keys(range).length > 0) {
    filter.purchasedAt = range;
  }

  const cursor = query.cursor;
  if (cursor) {
    // Must stay at full millisecond precision: truncating this to a day would
    // make the equality branch below match nothing and silently skip rows.
    const at = new Date(cursor.purchasedAt);
    // ANDed with any range above — $or is its own top-level key, so the two
    // purchasedAt predicates don't collide.
    filter.$or = [
      { purchasedAt: { $lt: at } },
      { purchasedAt: at, _id: { $lt: cursor.id } },
    ];
  }

  return filter;
}

@injectable()
export class PurchaseRepositoryImpl implements PurchaseRepository {
  async findPageByOrg(
    orgId: string,
    query: PurchaseListQuery,
  ): Promise<PurchasePage> {
    // limit + 1 is how "is there another page" gets answered without a count().
    const docs = await PurchaseModel.find(purchaseListFilter(orgId, query))
      .sort(LIST_SORT)
      .limit(query.limit + 1)
      .lean<PurchaseDoc[]>();
    return {
      items: docs.slice(0, query.limit).map(toPurchase),
      hasMore: docs.length > query.limit,
    };
  }

  async findById(orgId: string, id: string): Promise<Purchase | null> {
    const doc = await PurchaseModel.findOne({
      _id: id,
      orgId,
      deletedAt: null,
    }).lean<PurchaseDoc | null>();
    return doc ? toPurchase(doc) : null;
  }

  async create(orgId: string, data: PurchaseInput): Promise<Purchase> {
    const doc = await PurchaseModel.create({ orgId, ...data });
    return toPurchase(doc.toObject() as PurchaseDoc);
  }

  async update(
    orgId: string,
    id: string,
    data: PurchaseInput,
  ): Promise<Purchase | null> {
    const doc = await PurchaseModel.findOneAndUpdate(
      { _id: id, orgId, deletedAt: null },
      data,
      { returnDocument: "after" },
    ).lean<PurchaseDoc | null>();
    return doc ? toPurchase(doc) : null;
  }

  async softDelete(orgId: string, id: string): Promise<void> {
    await PurchaseModel.updateOne(
      { _id: id, orgId, deletedAt: null },
      { deletedAt: new Date() },
    );
  }
}

function toPurchase(doc: PurchaseDoc): Purchase {
  return {
    id: String(doc._id),
    purchasedAt: doc.purchasedAt.toISOString(),
    vendor: doc.vendor,
    lines: doc.lines.map((line) => ({
      productId: line.productId,
      units: line.units,
      totalCostCents: line.totalCostCents,
      packId: line.packId ?? null,
    })),
    receiptTotalCents: doc.receiptTotalCents ?? null,
    notes: doc.notes ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
