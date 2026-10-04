import { injectable } from "tsyringe";
import { MachineTemplateModel } from "../../models/MachineTemplate.ts";
import type {
  MachineTemplate,
  MachineTemplateInput,
  MachineTemplateRepository,
} from "./MachineTemplateRepository.ts";

type MachineTemplateDoc = {
  _id: unknown;
  name: string;
  kind: "snack" | "drink" | "combo";
  make?: string | null;
  model?: string | null;
  slots?: string[][];
  createdAt: Date;
  updatedAt: Date;
};

@injectable()
export class MachineTemplateRepositoryImpl implements MachineTemplateRepository {
  async findByOrg(orgId: string): Promise<MachineTemplate[]> {
    const docs = await MachineTemplateModel.find({ orgId, deletedAt: null })
      .sort({ name: 1 })
      .lean<MachineTemplateDoc[]>();
    return docs.map(toMachineTemplate);
  }

  async findById(orgId: string, id: string): Promise<MachineTemplate | null> {
    const doc = await MachineTemplateModel.findOne({
      _id: id,
      orgId,
      deletedAt: null,
    }).lean<MachineTemplateDoc | null>();
    return doc ? toMachineTemplate(doc) : null;
  }

  async create(
    orgId: string,
    data: MachineTemplateInput,
  ): Promise<MachineTemplate> {
    const doc = await MachineTemplateModel.create({ orgId, ...data });
    return toMachineTemplate(doc.toObject() as unknown as MachineTemplateDoc);
  }

  async update(
    orgId: string,
    id: string,
    data: MachineTemplateInput,
  ): Promise<MachineTemplate | null> {
    const doc = await MachineTemplateModel.findOneAndUpdate(
      { _id: id, orgId, deletedAt: null },
      data,
      { returnDocument: "after" },
    ).lean<MachineTemplateDoc | null>();
    return doc ? toMachineTemplate(doc) : null;
  }

  async softDelete(orgId: string, id: string): Promise<void> {
    await MachineTemplateModel.updateOne(
      { _id: id, orgId, deletedAt: null },
      { deletedAt: new Date() },
    );
  }
}

function toMachineTemplate(doc: MachineTemplateDoc): MachineTemplate {
  return {
    id: String(doc._id),
    name: doc.name,
    kind: doc.kind,
    make: doc.make ?? null,
    model: doc.model ?? null,
    slots: (doc.slots ?? []).map((shelf) => [...shelf]),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
