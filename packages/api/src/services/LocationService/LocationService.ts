import type { Location, LocationInput } from "@vendpire/platform";

export type { Location, LocationInput };

export interface LocationService {
  list(orgId: string): Promise<Location[]>;
  get(orgId: string, id: string): Promise<Location | null>;
  create(orgId: string, input: LocationInput): Promise<Location>;
  update(orgId: string, id: string, input: LocationInput): Promise<Location>;
  remove(orgId: string, id: string): Promise<void>;
}
