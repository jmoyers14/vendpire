import { inject, injectable } from "tsyringe";
import { normalizeSlots } from "@vendpire/domain";
import { MACHINE_TEMPLATE_REPOSITORY_TOKEN } from "@vendpire/platform";
import type {
  MachineTemplate,
  MachineTemplateInput,
  MachineTemplateRepository,
} from "@vendpire/platform";
import { ServiceError } from "../errors.ts";
import type { MachineTemplateService } from "./MachineTemplateService.ts";

/**
 * Machine-template business rules: a template needs a name that's unique within
 * the org (case-insensitively, so "AMS 39" and "ams 39" can't both exist) and
 * at least one slot, and its slot codes follow the same normalization as a
 * machine's face.
 *
 * `remove` has no dependency check on purpose: machines SNAPSHOT a template's
 * slots at create time, so deleting a template can't orphan anything.
 */
@injectable()
export class MachineTemplateServiceImpl implements MachineTemplateService {
  constructor(
    @inject(MACHINE_TEMPLATE_REPOSITORY_TOKEN)
    private readonly templates: MachineTemplateRepository,
  ) {}

  list(orgId: string): Promise<MachineTemplate[]> {
    return this.templates.findByOrg(orgId);
  }

  get(orgId: string, id: string): Promise<MachineTemplate | null> {
    return this.templates.findById(orgId, id);
  }

  async create(
    orgId: string,
    input: MachineTemplateInput,
  ): Promise<MachineTemplate> {
    const data = await this.validate(orgId, input, null);
    return this.templates.create(orgId, data);
  }

  async update(
    orgId: string,
    id: string,
    input: MachineTemplateInput,
  ): Promise<MachineTemplate> {
    const data = await this.validate(orgId, input, id);
    const updated = await this.templates.update(orgId, id, data);
    if (!updated) {
      throw new ServiceError("NOT_FOUND", "Machine template not found");
    }
    return updated;
  }

  async remove(orgId: string, id: string): Promise<void> {
    await this.templates.softDelete(orgId, id);
  }

  private async validate(
    orgId: string,
    input: MachineTemplateInput,
    excludeId: string | null,
  ): Promise<MachineTemplateInput> {
    const name = input.name.trim();
    if (!name) {
      throw new ServiceError("BAD_REQUEST", "Template name is required");
    }

    // Compared in memory rather than by query: the match is case-insensitive,
    // which a plain {orgId,name} index can't serve without matching collation,
    // and an org has a handful of templates.
    const existing = await this.templates.findByOrg(orgId);
    const clash = existing.find(
      (template) =>
        template.id !== excludeId &&
        template.name.toLowerCase() === name.toLowerCase(),
    );
    if (clash) {
      throw new ServiceError(
        "CONFLICT",
        `A template named "${clash.name}" already exists`,
      );
    }

    const { slots, duplicates } = normalizeSlots(input.slots);
    if (duplicates.length > 0) {
      throw new ServiceError(
        "BAD_REQUEST",
        `Duplicate slot codes: ${duplicates.join(", ")}`,
      );
    }
    if (slots.length === 0) {
      throw new ServiceError("BAD_REQUEST", "A template needs at least one slot");
    }

    const clean = (value: string | null): string | null => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    };

    return {
      name,
      kind: input.kind,
      make: clean(input.make),
      model: clean(input.model),
      slots,
    };
  }
}
