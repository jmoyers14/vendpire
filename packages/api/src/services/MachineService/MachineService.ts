import type { Machine, MachineInput } from "@vendpire/platform";

export type { Machine, MachineInput };

export interface MachineService {
  list(orgId: string): Promise<Machine[]>;
  get(orgId: string, id: string): Promise<Machine | null>;
  getByTagCode(orgId: string, tagCode: string): Promise<Machine | null>;
  create(orgId: string, input: MachineInput): Promise<Machine>;
  update(orgId: string, id: string, input: MachineInput): Promise<Machine>;
  remove(orgId: string, id: string): Promise<void>;
}
