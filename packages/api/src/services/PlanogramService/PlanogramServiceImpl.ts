import { inject, injectable } from "tsyringe";
import {
  MACHINE_REPOSITORY_TOKEN,
  PLANOGRAM_REPOSITORY_TOKEN,
  PRODUCT_REPOSITORY_TOKEN,
} from "@vendpire/platform";
import type {
  MachineRepository,
  Planogram,
  PlanogramInput,
  PlanogramRepository,
  ProductRepository,
} from "@vendpire/platform";
import { ServiceError } from "../errors.ts";
import type { PlanogramService } from "./PlanogramService.ts";

/**
 * Planogram business rules. Versions are immutable and strictly ordered: a new
 * version must be effective AFTER the current one, every slot code must exist
 * on the machine (and appear once), and every product must exist. This is what
 * lets past visits keep the exact par/price they were filled against.
 */
@injectable()
export class PlanogramServiceImpl implements PlanogramService {
  constructor(
    @inject(PLANOGRAM_REPOSITORY_TOKEN)
    private readonly planograms: PlanogramRepository,
    @inject(MACHINE_REPOSITORY_TOKEN)
    private readonly machines: MachineRepository,
    @inject(PRODUCT_REPOSITORY_TOKEN)
    private readonly products: ProductRepository,
  ) {}

  listByMachine(orgId: string, machineId: string): Promise<Planogram[]> {
    return this.planograms.findByMachine(orgId, machineId);
  }

  getCurrent(orgId: string, machineId: string): Promise<Planogram | null> {
    return this.planograms.findCurrentByMachine(orgId, machineId);
  }

  async create(orgId: string, input: PlanogramInput): Promise<Planogram> {
    const machine = await this.machines.findById(orgId, input.machineId);
    if (!machine) {
      throw new ServiceError("BAD_REQUEST", "Machine does not exist");
    }

    if (input.slots.length === 0) {
      throw new ServiceError("BAD_REQUEST", "A planogram needs at least one slot");
    }

    const slots = input.slots.map((slot) => ({
      ...slot,
      slotCode: slot.slotCode.trim().toUpperCase(),
    }));

    const seen = new Set<string>();
    for (const slot of slots) {
      if (seen.has(slot.slotCode)) {
        throw new ServiceError(
          "BAD_REQUEST",
          `Duplicate slot code ${slot.slotCode}`,
        );
      }
      seen.add(slot.slotCode);
      if (!machine.slotCodes.includes(slot.slotCode)) {
        throw new ServiceError(
          "BAD_REQUEST",
          `Machine has no slot ${slot.slotCode}`,
        );
      }
    }

    const productIds = [...new Set(slots.map((slot) => slot.productId))];
    const existing = await this.products.findExistingIds(orgId, productIds);
    const missing = productIds.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      throw new ServiceError(
        "BAD_REQUEST",
        `Unknown product(s): ${missing.join(", ")}`,
      );
    }

    const current = await this.planograms.findCurrentByMachine(
      orgId,
      input.machineId,
    );
    if (current && input.effectiveFrom <= current.effectiveFrom) {
      throw new ServiceError(
        "BAD_REQUEST",
        "effectiveFrom must be newer than the current version's",
      );
    }

    return this.planograms.create(orgId, { ...input, slots });
  }
}
