import { injectable } from "tsyringe";
import type { Types } from "mongoose";
import { ProductModel } from "../../models/Product.ts";
import { toId } from "../ids.ts";
import type {
  Product,
  ProductInput,
  ProductRepository,
} from "./ProductRepository.ts";

type ProductDoc = {
  _id: Types.ObjectId;
  name: string;
  upc?: string | null;
  category: string;
  taxClass?: string | null;
  imageUrl?: string | null;
  defaultPriceCents: number;
  active: boolean;
  /** Optional: rows written before the field became required have no key. */
  tracksExpiration?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@injectable()
export class ProductRepositoryImpl implements ProductRepository {
  async findByOrg(orgId: string): Promise<Product[]> {
    const docs = await ProductModel.find({ orgId, deletedAt: null })
      .sort({ name: 1 })
      .lean<ProductDoc[]>();
    return docs.map(toProduct);
  }

  async findById(orgId: string, id: string): Promise<Product | null> {
    const doc = await ProductModel.findOne({
      _id: id,
      orgId,
      deletedAt: null,
    }).lean<ProductDoc | null>();
    return doc ? toProduct(doc) : null;
  }

  async findByUpc(orgId: string, upc: string): Promise<Product | null> {
    const doc = await ProductModel.findOne({
      orgId,
      upc,
      deletedAt: null,
    }).lean<ProductDoc | null>();
    return doc ? toProduct(doc) : null;
  }

  async findExistingIds(orgId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) {
      return new Set();
    }
    const docs = await ProductModel.find(
      { _id: { $in: ids }, orgId, deletedAt: null },
      { _id: 1 },
    ).lean<{ _id: Types.ObjectId }[]>();
    return new Set(docs.map((doc) => toId(doc._id)));
  }

  async findExistingIdsIncludingDeleted(
    orgId: string,
    ids: string[],
  ): Promise<Set<string>> {
    if (ids.length === 0) {
      return new Set();
    }
    const docs = await ProductModel.find(
      { _id: { $in: ids }, orgId },
      { _id: 1 },
    ).lean<{ _id: Types.ObjectId }[]>();
    return new Set(docs.map((doc) => toId(doc._id)));
  }

  async findByIdsIncludingDeleted(
    orgId: string,
    ids: string[],
  ): Promise<Product[]> {
    // Guarded because `$in: []` matches nothing but still costs a round trip,
    // and every caller here can legitimately have no ids.
    if (ids.length === 0) {
      return [];
    }
    // Note the deliberate absence of `deletedAt: null` — that omission is the
    // whole point of the method.
    const docs = await ProductModel.find({
      _id: { $in: ids },
      orgId,
    }).lean<ProductDoc[]>();
    return docs.map(toProduct);
  }

  async create(orgId: string, data: ProductInput): Promise<Product> {
    const doc = await ProductModel.create({ orgId, ...data });
    return toProduct(doc.toObject() as ProductDoc);
  }

  async update(
    orgId: string,
    id: string,
    data: ProductInput,
  ): Promise<Product | null> {
    const doc = await ProductModel.findOneAndUpdate(
      { _id: id, orgId, deletedAt: null },
      data,
      { returnDocument: "after" },
    ).lean<ProductDoc | null>();
    return doc ? toProduct(doc) : null;
  }

  async softDelete(orgId: string, id: string): Promise<void> {
    await ProductModel.updateOne(
      { _id: id, orgId, deletedAt: null },
      { deletedAt: new Date() },
    );
  }
}

function toProduct(doc: ProductDoc): Product {
  return {
    id: toId(doc._id),
    name: doc.name,
    upc: doc.upc ?? null,
    category: doc.category,
    taxClass: doc.taxClass ?? null,
    imageUrl: doc.imageUrl ?? null,
    defaultPriceCents: doc.defaultPriceCents,
    active: doc.active,
    // Covers rows read between deploy and backfill. Matches the schema
    // default so the two cannot disagree.
    tracksExpiration: doc.tracksExpiration ?? true,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
