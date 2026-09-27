import { injectable } from "tsyringe";
import { PlanogramModel } from "../../models/Planogram.ts";
import type {
  Planogram,
  PlanogramInput,
  PlanogramRepository,
} from "./PlanogramRepository.ts";

type PlanogramDoc = {
  _id: unknown;
  machineId: string;
  effectiveFrom: Date;
  slots: {
    slotCode: string;
    productId: string;
    par: number;
    priceCents: number;
  }[];
  createdAt: Date;
  updatedAt: Date;
};

@injectable()
export class PlanogramRepositoryImpl implements PlanogramRepository {
  async findByMachine(orgId: string, machineId: string): Promise<Planogram[]> {
    const docs = await PlanogramModel.find({ orgId, machineId, deletedAt: null })
      .sort({ effectiveFrom: -1 })
      .lean<PlanogramDoc[]>();
    return docs.map(toPlanogram);
  }

  async findCurrentByMachine(
    orgId: string,
    machineId: string,
  ): Promise<Planogram | null> {
    const doc = await PlanogramModel.findOne({ orgId, machineId, deletedAt: null })
      .sort({ effectiveFrom: -1 })
      .lean<PlanogramDoc | null>();
    return doc ? toPlanogram(doc) : null;
  }

  async findCurrentByOrg(orgId: string): Promise<Planogram[]> {
    // Latest effectiveFrom per machine, in one pass.
    const docs = await PlanogramModel.aggregate<PlanogramDoc>([
      { $match: { orgId, deletedAt: null } },
      { $sort: { effectiveFrom: -1 } },
      { $group: { _id: "$machineId", doc: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$doc" } },
    ]);
    return docs.map(toPlanogram);
  }

  async countByMachine(orgId: string, machineId: string): Promise<number> {
    return PlanogramModel.countDocuments({ orgId, machineId, deletedAt: null });
  }

  async create(orgId: string, data: PlanogramInput): Promise<Planogram> {
    const doc = await PlanogramModel.create({ orgId, ...data });
    return toPlanogram(doc.toObject() as PlanogramDoc);
  }
}

function toPlanogram(doc: PlanogramDoc): Planogram {
  return {
    id: String(doc._id),
    machineId: doc.machineId,
    effectiveFrom: doc.effectiveFrom.toISOString(),
    slots: doc.slots.map((slot) => ({
      slotCode: slot.slotCode,
      productId: slot.productId,
      par: slot.par,
      priceCents: slot.priceCents,
    })),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
