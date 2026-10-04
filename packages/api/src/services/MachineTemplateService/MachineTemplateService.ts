import type { MachineTemplate, MachineTemplateInput } from "@vendpire/platform";

export type { MachineTemplate, MachineTemplateInput };

export interface MachineTemplateService {
  list(orgId: string): Promise<MachineTemplate[]>;
  get(orgId: string, id: string): Promise<MachineTemplate | null>;
  create(orgId: string, input: MachineTemplateInput): Promise<MachineTemplate>;
  update(
    orgId: string,
    id: string,
    input: MachineTemplateInput,
  ): Promise<MachineTemplate>;
  remove(orgId: string, id: string): Promise<void>;
}
