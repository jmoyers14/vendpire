import { inject, injectable } from "tsyringe";
import {
  LOCATION_REPOSITORY_TOKEN,
  MACHINE_REPOSITORY_TOKEN,
  PLANOGRAM_REPOSITORY_TOKEN,
} from "@vendpire/platform";
import type {
  LocationRepository,
  Machine,
  MachineInput,
  MachineRepository,
  PlanogramRepository,
} from "@vendpire/platform";
import { ServiceError } from "../errors.ts";
import type { MachineService } from "./MachineService.ts";

/**
 * Machine business rules: the referenced location must exist, slot codes are
 * normalized (uppercased, trimmed) and must be unique within the machine, the
 * QR tagCode must be unique within the org, and a machine with planogram
 * history can't be removed — it would orphan the versions visits point at.
 */
@injectable()
export class MachineServiceImpl implements MachineService {
  constructor(
    @inject(MACHINE_REPOSITORY_TOKEN)
    private readonly machines: MachineRepository,
    @inject(LOCATION_REPOSITORY_TOKEN)
    private readonly locations: LocationRepository,
    @inject(PLANOGRAM_REPOSITORY_TOKEN)
    private readonly planograms: PlanogramRepository,
  ) {}

  list(orgId: string): Promise<Machine[]> {
    return this.machines.findByOrg(orgId);
  }

  get(orgId: string, id: string): Promise<Machine | null> {
    return this.machines.findById(orgId, id);
  }

  getByTagCode(orgId: string, tagCode: string): Promise<Machine | null> {
    return this.machines.findByTagCode(orgId, tagCode);
  }

  async create(orgId: string, input: MachineInput): Promise<Machine> {
    const data = await this.validate(orgId, input, null);
    return this.machines.create(orgId, data);
  }

  async update(
    orgId: string,
    id: string,
    input: MachineInput,
  ): Promise<Machine> {
    const data = await this.validate(orgId, input, id);
    const updated = await this.machines.update(orgId, id, data);
    if (!updated) {
      throw new ServiceError("NOT_FOUND", "Machine not found");
    }
    return updated;
  }

  async remove(orgId: string, id: string): Promise<void> {
    const planogramCount = await this.planograms.countByMachine(orgId, id);
    if (planogramCount > 0) {
      throw new ServiceError(
        "CONFLICT",
        "Machine has planogram history; deactivate it instead of removing it",
      );
    }
    await this.machines.softDelete(orgId, id);
  }

  private async validate(
    orgId: string,
    input: MachineInput,
    excludeId: string | null,
  ): Promise<MachineInput> {
    const location = await this.locations.findById(orgId, input.locationId);
    if (!location) {
      throw new ServiceError("BAD_REQUEST", "Location does not exist");
    }

    const slots = input.slots
      .map((shelf) =>
        shelf.map((code) => code.trim().toUpperCase()).filter(Boolean),
      )
      .filter((shelf) => shelf.length > 0);
    const flat = slots.flat();
    if (new Set(flat).size !== flat.length) {
      throw new ServiceError("BAD_REQUEST", "Duplicate slot codes");
    }

    const clean = (value: string | null): string | null => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    };
    const tagCode = clean(input.tagCode);
    if (tagCode) {
      const existing = await this.machines.findByTagCode(orgId, tagCode);
      if (existing && existing.id !== excludeId) {
        throw new ServiceError(
          "CONFLICT",
          `Tag code ${tagCode} is already on machine "${existing.name}"`,
        );
      }
    }

    return {
      locationId: input.locationId,
      name: input.name.trim(),
      kind: input.kind,
      make: clean(input.make),
      model: clean(input.model),
      serial: clean(input.serial),
      tagCode,
      slots,
      cardReader: input.cardReader,
      active: input.active,
    };
  }
}
