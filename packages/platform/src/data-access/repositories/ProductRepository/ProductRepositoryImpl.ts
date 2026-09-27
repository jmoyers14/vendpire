import { injectable } from "tsyringe";
import { ProductModel } from "../../models/Product.ts";
import type {
  Product,
  ProductInput,
  ProductRepository,
} from "./ProductRepository.ts";

type ProductDoc = {
  _id: unknown;
  name: string;
  upc?: string | null;
  category: string;
  taxClass?: string | null;
  defaultPriceCents: number;
  active: boolean;
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

  async findExistingIds(orgId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) {
      return new Set();
    }
    const docs = await ProductModel.find(
      { _id: { $in: ids }, orgId, deletedAt: null },
      { _id: 1 },
    ).lean<{ _id: unknown }[]>();
    return new Set(docs.map((doc) => String(doc._id)));
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
    id: String(doc._id),
    name: doc.name,
    upc: doc.upc ?? null,
    category: doc.category,
    taxClass: doc.taxClass ?? null,
    defaultPriceCents: doc.defaultPriceCents,
    active: doc.active,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
