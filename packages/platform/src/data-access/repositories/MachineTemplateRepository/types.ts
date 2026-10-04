/**
 * MachineTemplate entity — plain data, free of Mongoose types.
 */
export interface MachineTemplate {
  id: string;
  name: string;
  kind: "snack" | "drink" | "combo";
  make: string | null;
  model: string | null;
  /** Same shape as Machine.slots: one array per shelf, codes in walking order. */
  slots: string[][];
  createdAt: string;
  updatedAt: string;
}

export type MachineTemplateInput = Omit<
  MachineTemplate,
  "id" | "createdAt" | "updatedAt"
>;
