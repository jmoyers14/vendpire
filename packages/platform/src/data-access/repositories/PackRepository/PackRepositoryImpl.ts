import { injectable } from "tsyringe";
import { PackModel } from "../../models/Pack.ts";
import type { Pack, PackInput, PackRepository } from "./PackRepository.ts";

type PackDoc = {
  _id: unknown;
  name: string;
  barcodes?: string[];
  contents: { productId: string; units: number }[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@injectable()
export class PackRepositoryImpl implements PackRepository {
  async findByOrg(orgId: string): Promise<Pack[]> {
    const docs = await PackModel.find({ orgId, deletedAt: null })
      .sort({ name: 1 })
      .lean<PackDoc[]>();
    return docs.map(toPack);
  }

  async findById(orgId: string, id: string): Promise<Pack | null> {
    const doc = await PackModel.findOne({
      _id: id,
      orgId,
      deletedAt: null,
    }).lean<PackDoc | null>();
    return doc ? toPack(doc) : null;
  }

  async findByBarcode(orgId: string, gtin14: string): Promise<Pack | null> {
    const doc = await PackModel.findOne({
      orgId,
      barcodes: gtin14,
      deletedAt: null,
    }).lean<PackDoc | null>();
    return doc ? toPack(doc) : null;
  }

  async countByProduct(orgId: string, productId: string): Promise<number> {
    return PackModel.countDocuments({
      orgId,
      "contents.productId": productId,
      deletedAt: null,
    });
  }

  async create(orgId: string, data: PackInput): Promise<Pack> {
    const doc = await PackModel.create({ orgId, ...data });
    return toPack(doc.toObject() as unknown as PackDoc);
  }

  async update(orgId: string, id: string, data: PackInput): Promise<Pack | null> {
    const doc = await PackModel.findOneAndUpdate(
      { _id: id, orgId, deletedAt: null },
      data,
      { returnDocument: "after" },
    ).lean<PackDoc | null>();
    return doc ? toPack(doc) : null;
  }

  async softDelete(orgId: string, id: string): Promise<void> {
    await PackModel.updateOne(
      { _id: id, orgId, deletedAt: null },
      { deletedAt: new Date() },
    );
  }
}

function toPack(doc: PackDoc): Pack {
  return {
    id: String(doc._id),
    name: doc.name,
    barcodes: doc.barcodes ?? [],
    contents: doc.contents.map((content) => ({
      productId: content.productId,
      units: content.units,
    })),
    active: doc.active,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
