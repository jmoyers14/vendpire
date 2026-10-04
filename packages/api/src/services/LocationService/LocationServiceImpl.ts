import { inject, injectable } from "tsyringe";
import {
  LOCATION_REPOSITORY_TOKEN,
  MACHINE_REPOSITORY_TOKEN,
} from "@vendpire/platform";
import type {
  Location,
  LocationInput,
  LocationRepository,
  MachineRepository,
} from "@vendpire/platform";
import { ServiceError } from "../errors.ts";
import type { LocationService } from "./LocationService.ts";

/**
 * Location business rules: normalize contact details, keep the commission
 * shape internally consistent (a percent commission must carry basis points,
 * a flat one a cent amount, and "none" carries nothing), and protect
 * referential integrity — a location with machines can't be removed.
 */
@injectable()
export class LocationServiceImpl implements LocationService {
  constructor(
    @inject(LOCATION_REPOSITORY_TOKEN)
    private readonly locations: LocationRepository,
    @inject(MACHINE_REPOSITORY_TOKEN)
    private readonly machines: MachineRepository,
  ) {}

  list(orgId: string): Promise<Location[]> {
    return this.locations.findByOrg(orgId);
  }

  get(orgId: string, id: string): Promise<Location | null> {
    return this.locations.findById(orgId, id);
  }

  async create(orgId: string, input: LocationInput): Promise<Location> {
    return this.locations.create(orgId, normalize(input));
  }

  async update(
    orgId: string,
    id: string,
    input: LocationInput,
  ): Promise<Location> {
    const updated = await this.locations.update(orgId, id, normalize(input));
    if (!updated) {
      throw new ServiceError("NOT_FOUND", "Location not found");
    }
    return updated;
  }

  async remove(orgId: string, id: string): Promise<void> {
    const machineCount = await this.machines.countByLocation(orgId, id);
    if (machineCount > 0) {
      throw new ServiceError(
        "CONFLICT",
        `Location has ${machineCount} machine(s); move or remove them first`,
      );
    }
    await this.locations.softDelete(orgId, id);
  }
}

function normalize(input: LocationInput): LocationInput {
  const clean = (value: string | null): string | null => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };
  return {
    name: input.name.trim(),
    address: {
      line1: clean(input.address.line1),
      city: clean(input.address.city),
      state: clean(input.address.state),
      zip: clean(input.address.zip),
      geo: input.address.geo,
    },
    contact: {
      name: clean(input.contact.name),
      phone: clean(input.contact.phone),
      email: clean(input.contact.email)?.toLowerCase() ?? null,
    },
    commission: input.commission,
    notes: clean(input.notes),
    active: input.active,
  };
}
