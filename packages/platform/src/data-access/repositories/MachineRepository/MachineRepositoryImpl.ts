import { injectable } from "tsyringe";
import { MachineModel } from "../../models/Machine.ts";
import type {
  Machine,
  MachineInput,
  MachineRepository,
} from "./MachineRepository.ts";

type MachineDoc = {
  _id: unknown;
  locationId: string;
  name: string;
  kind: "snack" | "drink" | "combo";
  make?: string | null;
  model?: string | null;
  serial?: string | null;
  tagCode?: string | null;
  slotCodes?: string[];
  cardReader?: { provider: "nayax" | "cantaloupe"; deviceId: string } | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@injectable()
export class MachineRepositoryImpl implements MachineRepository {
  async findByOrg(orgId: string): Promise<Machine[]> {
    const docs = await MachineModel.find({ orgId, deletedAt: null })
      .sort({ name: 1 })
      .lean<MachineDoc[]>();
    return docs.map(toMachine);
  }

  async findById(orgId: string, id: string): Promise<Machine | null> {
    const doc = await MachineModel.findOne({
      _id: id,
      orgId,
      deletedAt: null,
    }).lean<MachineDoc | null>();
    return doc ? toMachine(doc) : null;
  }

  async findByTagCode(orgId: string, tagCode: string): Promise<Machine | null> {
    const doc = await MachineModel.findOne({
      orgId,
      tagCode,
      deletedAt: null,
    }).lean<MachineDoc | null>();
    return doc ? toMachine(doc) : null;
  }

  async countByLocation(orgId: string, locationId: string): Promise<number> {
    return MachineModel.countDocuments({ orgId, locationId, deletedAt: null });
  }

  async create(orgId: string, data: MachineInput): Promise<Machine> {
    const doc = await MachineModel.create({ orgId, ...data });
    return toMachine(doc.toObject() as MachineDoc);
  }

  async update(
    orgId: string,
    id: string,
    data: MachineInput,
  ): Promise<Machine | null> {
    const doc = await MachineModel.findOneAndUpdate(
      { _id: id, orgId, deletedAt: null },
      data,
      { returnDocument: "after" },
    ).lean<MachineDoc | null>();
    return doc ? toMachine(doc) : null;
  }

  async softDelete(orgId: string, id: string): Promise<void> {
    await MachineModel.updateOne(
      { _id: id, orgId, deletedAt: null },
      { deletedAt: new Date() },
    );
  }
}

function toMachine(doc: MachineDoc): Machine {
  return {
    id: String(doc._id),
    locationId: doc.locationId,
    name: doc.name,
    kind: doc.kind,
    make: doc.make ?? null,
    model: doc.model ?? null,
    serial: doc.serial ?? null,
    tagCode: doc.tagCode ?? null,
    slotCodes: doc.slotCodes ?? [],
    cardReader: doc.cardReader
      ? { provider: doc.cardReader.provider, deviceId: doc.cardReader.deviceId }
      : null,
    active: doc.active,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
