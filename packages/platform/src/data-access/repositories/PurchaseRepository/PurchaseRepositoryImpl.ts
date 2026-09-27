import { injectable } from "tsyringe";
import { PurchaseModel } from "../../models/Purchase.ts";
import type {
  Purchase,
  PurchaseInput,
  PurchaseRepository,
} from "./PurchaseRepository.ts";

type PurchaseDoc = {
  _id: unknown;
  purchasedAt: Date;
  vendor: string;
  lines: { productId: string; units: number; totalCostCents: number }[];
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@injectable()
export class PurchaseRepositoryImpl implements PurchaseRepository {
  async findByOrg(orgId: string): Promise<Purchase[]> {
    const docs = await PurchaseModel.find({ orgId, deletedAt: null })
      .sort({ purchasedAt: -1 })
      .lean<PurchaseDoc[]>();
    return docs.map(toPurchase);
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
    })),
    notes: doc.notes ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
