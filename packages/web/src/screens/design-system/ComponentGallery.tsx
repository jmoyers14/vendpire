import { type ReactNode, useState } from "react";
import {
  Badge,
  Button,
  ChipGroup,
  Fact,
  FactsPanel,
  FactVerdict,
  Field,
  FieldRow,
  FormSection,
  IconButton,
  Kbd,
  MachineMap,
  MachineMapLegend,
  type MachineTile,
  MoneyInput,
  NumberInput,
  PageHeader,
  ProgressBar,
  RowTable,
  RowTableBody,
  RowTableEmpty,
  RowTableFooter,
  RowTableHeader,
  RowTableRow,
  SaveBar,
  SectionDivider,
  Select,
  type Step,
  Stepper,
  stockTone,
  Switch,
  TextArea,
  TextInput,
  pageLinkClass,
  useFormDraft,
} from "../../ui.tsx";

/**
 * Every Lagoon refresh component in its states, for eyeballing changes to
 * theme.css or a component against the whole set. Lives on /design.
 */

const Demo = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="grid gap-3">
    <h2 className="text-overline text-muted-strong uppercase">{title}</h2>
    {children}
  </section>
);

const Surface = ({ children }: { children: ReactNode }) => (
  <div className="grid gap-6 rounded-card border border-line bg-card p-6 shadow-card">
    {children}
  </div>
);

const TypeScaleDemo = () => (
  <Surface>
    <p className="font-display text-display text-ink">Display · Snack Machine</p>
    <p className="font-display text-title text-ink">Title · Sun Chips Original 1.5 oz</p>
    <p className="font-display text-heading text-ink">Heading · Pricing</p>
    <p className="font-display text-stat text-ink tabular-nums">Stat · $412.50</p>
    <p className="text-body text-ink-soft">Body · Count before pulling or refilling.</p>
    <p className="text-body-sm text-muted-strong">Body small · Par 10 · filled to 4 last visit</p>
    <p className="text-label text-ink">Label · Found in slot</p>
    <p className="text-overline text-muted-strong uppercase">Overline · Slot price</p>
    <p className="font-mono text-mono text-ink tabular-nums">Mono · B4 · $1.75 · 24 units</p>
  </Surface>
);

const ButtonsDemo = () => (
  <Surface>
    <div className="flex flex-wrap items-center gap-3">
      <Button>Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="text">Text button</Button>
      <Button variant="danger">Delete visit</Button>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled>Primary disabled</Button>
      <Button variant="secondary" disabled>
        Secondary disabled
      </Button>
      <Button variant="text" disabled>
        Text disabled
      </Button>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Button size="lg" variant="secondary">
        Large · beside an input
      </Button>
      <Button size="sm">Small</Button>
      <Button size="sm" variant="secondary">
        Small secondary
      </Button>
      <IconButton label="Remove 7up - 12 oz" tone="danger">
        ×
      </IconButton>
      <IconButton label="Edit price">✎</IconButton>
    </div>
    <p className="flex flex-wrap items-center gap-1.5 text-body-sm text-muted-strong">
      <Kbd>Tab</Kbd> next field <Kbd>Enter</Kbd> next slot
    </p>
  </Surface>
);

const BadgesDemo = () => (
  <Surface>
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="success">Active</Badge>
      <Badge>Inactive</Badge>
      <Badge tone="warning">Expiring</Badge>
      <Badge tone="danger">Empty</Badge>
      <Badge size="sm">Item</Badge>
      <Badge size="sm" tone="action">
        Pack of 35
      </Badge>
    </div>
  </Surface>
);

const FieldsDemo = () => {
  const [count, setCount] = useState("");
  const [price, setPrice] = useState("2.00");
  return (
    <Surface>
      <FieldRow>
        <Field label="Name" hint='Include the size, e.g. "7up - 12 oz", so similar products stay distinct.'>
          <TextInput defaultValue="7up - 12 oz" />
        </Field>
        <Field label="Category">
          <Select defaultValue="soda">
            <option value="soda">Soda</option>
            <option value="chips">Chips</option>
          </Select>
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="UPC" isOptional hint="Scan it or type it in.">
          <TextInput placeholder="e.g. 078000113464" />
        </Field>
        <Field label="Tax class" error="Tax class can't be longer than 40 characters.">
          <TextInput defaultValue="A very long tax class that fails validation" />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Date">
          <TextInput type="date" defaultValue="2026-11-11" />
        </Field>
        <Field label="Disabled">
          <TextInput defaultValue="Can't change this" disabled />
        </Field>
      </FieldRow>
      <Field label="Notes" isOptional>
        <TextArea placeholder="e.g. Coke was on sale, stocked up for two weeks" />
      </Field>
      <SectionDivider />
      <FieldRow>
        <Field label="Found in slot (large)">
          <NumberInput
            size="lg"
            suffix="/ 10"
            value={count}
            onChange={(event) => setCount(event.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Price" hint="Suggested $1.50.">
          <MoneyInput value={price} onChange={(event) => setPrice(event.target.value)} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Qty (small, in a row)">
          <NumberInput size="sm" suffix="units" defaultValue="24" />
        </Field>
        <Field label="Total paid (small)">
          <MoneyInput size="sm" defaultValue="15.99" className="text-right" />
        </Field>
      </FieldRow>
    </Surface>
  );
};

const SwitchesDemo = () => {
  const [isTracking, setIsTracking] = useState(true);
  const [isActive, setIsActive] = useState(false);
  return (
    <Surface>
      <Switch
        title="Track expiration dates"
        description="On for anything with a printed best-by date. Turn it off for gum, bulk candy and non-food, and visits will stop asking for a date."
        isChecked={isTracking}
        onChange={setIsTracking}
      />
      <SectionDivider />
      <Switch
        title="Active"
        description="Inactive products stay in history but drop out of search."
        isChecked={isActive}
        onChange={setIsActive}
      />
      <SectionDivider />
      <Switch title="Disabled" isChecked isDisabled onChange={() => {}} />
    </Surface>
  );
};

const PURCHASE_COLUMNS = "minmax(0,1fr) 128px 140px 104px 40px";

const RowTableDemo = () => (
  <Surface>
    <RowTable columns={PURCHASE_COLUMNS}>
      <RowTableHeader>
        <span>Product</span>
        <span>Qty</span>
        <span className="text-right">Total paid</span>
        <span className="text-right">Per unit</span>
        <span />
      </RowTableHeader>
      <RowTableBody>
        <RowTableRow>
          <span className="grid justify-items-start gap-1">
            <span className="text-label text-ink">Coca-Cola Zero Sugar - 12 oz</span>
            <Badge size="sm">Item</Badge>
          </span>
          <NumberInput size="sm" suffix="units" defaultValue="24" aria-label="Quantity" />
          <MoneyInput size="sm" defaultValue="15.99" className="text-right" aria-label="Total paid" />
          <span className="text-right font-mono text-mono tabular-nums">$0.67</span>
          <IconButton label="Remove Coca-Cola Zero Sugar" tone="danger">
            ×
          </IconButton>
        </RowTableRow>
        <RowTableRow>
          <span className="grid justify-items-start gap-1">
            <span className="text-label text-ink">Coca-Cola Classic - 12 oz, case of 35</span>
            <Badge size="sm" tone="action">
              Pack of 35
            </Badge>
          </span>
          <NumberInput size="sm" suffix="packs" defaultValue="2" aria-label="Quantity" />
          <MoneyInput size="sm" defaultValue="35.98" className="text-right" aria-label="Total paid" />
          <span className="text-right font-mono text-mono tabular-nums">
            $0.51
            <span className="block font-sans text-xs text-muted-strong">70 units</span>
          </span>
          <IconButton label="Remove Coca-Cola Classic" tone="danger">
            ×
          </IconButton>
        </RowTableRow>
      </RowTableBody>
      <RowTableFooter>
        <span>2 items · 0 missing qty or total</span>
        <span />
        <span className="text-right font-mono tabular-nums">$51.97</span>
        <span />
        <span />
      </RowTableFooter>
    </RowTable>

    <RowTable columns="minmax(0,1fr) 168px 196px" variant="plain">
      <RowTableHeader>
        <span>Product</span>
        <span>Found in slot</span>
        <span>Best by</span>
      </RowTableHeader>
      <RowTableBody>
        <RowTableRow>
          <span>
            <span className="block text-body font-bold text-ink">Sun Chips Original 1.5 oz</span>
            <span className="text-body-sm text-muted-strong">Par 10 · filled to 4 last visit</span>
          </span>
          <NumberInput size="lg" suffix="/ 10" placeholder="0" aria-label="Found in slot" />
          <TextInput type="date" className="h-14" aria-label="Best by" />
        </RowTableRow>
      </RowTableBody>
    </RowTable>

    <RowTable columns={PURCHASE_COLUMNS}>
      <RowTableHeader>
        <span>Product</span>
        <span>Qty</span>
        <span>Total paid</span>
        <span>Per unit</span>
        <span />
      </RowTableHeader>
      <RowTableEmpty>Scan or search above to add the first item.</RowTableEmpty>
    </RowTable>
  </Surface>
);

const FactsDemo = () => (
  <Surface>
    <div className="grid gap-6 sm:grid-cols-2">
      <FactsPanel>
        <Fact label="Last paid" detail="Previous Owner · Oct 29, 2026" value="$0.64 / unit" />
        <Fact label="You keep per sale" value="+$1.36" tone="good" />
        <Fact label="Margin" value="68%" tone="good" />
      </FactsPanel>
      <FactsPanel>
        <Fact label="Items total" value="$51.97" />
        <Fact label="Receipt total" value="$128.47" />
        <FactVerdict tone="warning">Items are $76.50 under the receipt</FactVerdict>
      </FactsPanel>
      <FactsPanel>
        <Fact label="Items total" value="$51.97" />
        <Fact label="Receipt total" value="$51.97" />
        <FactVerdict tone="success">✓ Matches the receipt</FactVerdict>
      </FactsPanel>
      <FactsPanel>
        <Fact label="Items total" value="$51.97" />
        <Fact label="Receipt total" value="—" />
        <FactVerdict tone="neutral">Enter the receipt total to compare.</FactVerdict>
      </FactsPanel>
    </div>
  </Surface>
);

type VisitStep = "count" | "restock" | "review";

const StepperDemo = () => {
  const [current, setCurrent] = useState<VisitStep>("restock");
  const order: VisitStep[] = ["count", "restock", "review"];
  const statusOf = (id: VisitStep) => {
    const offset = order.indexOf(id) - order.indexOf(current);
    if (offset < 0) {
      return "done" as const;
    }
    return offset === 0 ? ("current" as const) : ("upcoming" as const);
  };
  const steps: Step<VisitStep>[] = [
    { id: "count", label: "Count", detail: "37 of 37 counted", status: statusOf("count") },
    { id: "restock", label: "Restock", detail: "12 of 38 answered", status: statusOf("restock") },
    { id: "review", label: "Review", detail: "Check and save", status: statusOf("review") },
  ];
  return <Stepper label="Visit steps" steps={steps} onSelect={setCurrent} />;
};

const CHIP_REASONS = [
  { value: "expired", label: "Expired" },
  { value: "damaged", label: "Damaged" },
  { value: "recalled", label: "Recalled" },
  { value: "destocked", label: "Back to the van" },
] as const;

const ChipsDemo = () => {
  const [reason, setReason] = useState<(typeof CHIP_REASONS)[number]["value"] | null>(
    "expired",
  );
  return (
    <Surface>
      <ChipGroup label="Reason" options={[...CHIP_REASONS]} value={reason} onChange={setReason} />
    </Surface>
  );
};

// A 6-shelf machine with 5- and 9-slot rows, like the AMS in the mockups.
const SHELVES = [
  ["A0", "A2", "A4", "A6", "A8"],
  ["B0", "B2", "B4", "B6", "B8"],
  ["C0", "C2", "C4", "C6", "C8"],
  ["D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8"],
  ["E0", "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8"],
  ["F0", "F2", "F4", "F6", "F8"],
];

const PAR = 10;
const FOUND: Record<string, number> = { A0: 5, A2: 8, A4: 6, A6: 0, A8: 7, B0: 4, B2: 2 };
const SHARED = new Set(["A0", "A8", "C2", "D5", "E4"]);
const NAMES: Record<string, string> = {
  A0: "Doritos Nacho, Cheetos",
  B4: "Sun Chips Original 1.5 oz",
  D5: "Twix, Snickers",
  E4: "Twix, KitKat",
};

const countTile = (slotCode: string): MachineTile => {
  const names = NAMES[slotCode] ?? "Fritos Original";
  if (slotCode === "F0") {
    return { value: "—", isEmpty: true, label: `${slotCode}: empty slot`, tone: "pending" };
  }
  const found = FOUND[slotCode];
  const base = {
    productCount: SHARED.has(slotCode) ? 2 : 1,
    searchText: names,
  };
  if (found === undefined) {
    return { ...base, value: "—", tone: "pending", label: `${slotCode}: ${names}, not counted` };
  }
  const tone = stockTone(found, PAR);
  return {
    ...base,
    value: found,
    meter: found / PAR,
    tone: tone === "critical" ? "out" : tone === "warning" ? "low" : "neutral",
    label: `${slotCode}: ${names}, ${found} of ${PAR}`,
  };
};

const RESTOCK_VALUES: Record<string, Pick<MachineTile, "value" | "tone">> = {
  A0: { value: "+3", tone: "done" },
  A2: { value: "−2", tone: "done" },
  A4: { value: "→B2", tone: "done" },
  A6: { value: "⇄C4", tone: "done" },
  A8: { value: "New", tone: "done" },
  B0: { value: "✓", tone: "done" },
};

const MachineMapDemo = () => {
  const [selected, setSelected] = useState<string | null>("B4");
  const [isPicking, setIsPicking] = useState(false);
  const counted = Object.keys(FOUND).length;
  const countable = SHELVES.flat().length - 1;

  const restockTile = (slotCode: string): MachineTile => {
    const answer = RESTOCK_VALUES[slotCode] ?? { value: "—", tone: "pending" as const };
    const isSource = isPicking && slotCode === selected;
    return {
      ...answer,
      productCount: SHARED.has(slotCode) ? 2 : 1,
      isEmpty: slotCode === "F0",
      isSource,
      isTarget: isPicking && !isSource,
      label: `${slotCode}: ${String(answer.value)}`,
      searchText: NAMES[slotCode] ?? "Fritos Original",
    };
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Surface>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-heading text-ink">Count</h3>
          <span className="text-body-sm text-muted-strong">Selected: {selected ?? "none"}</span>
        </div>
        <MachineMap
          shelves={SHELVES}
          tileFor={countTile}
          selectedCode={selected}
          onSelect={setSelected}
          search={{ label: "Go to slot or product", placeholder: "Go to slot or product, e.g. D5 or Twix" }}
        />
        <MachineMapLegend
          items={[
            { indicator: "success", label: "Stocked" },
            { indicator: "warning", label: "Low (30% or less)" },
            { indicator: "danger", label: "Empty" },
          ]}
        />
        <div className="grid gap-2">
          <ProgressBar value={counted} max={countable} label="Slots counted" />
          <p className="text-body-sm text-ink-soft tabular-nums">
            {counted} of {countable} counted
          </p>
        </div>
      </Surface>
      <Surface>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-heading text-ink">Restock</h3>
          <Button size="sm" variant="secondary" onClick={() => setIsPicking((value) => !value)}>
            {isPicking ? "Cancel move" : `Move ${selected ?? "a slot"}`}
          </Button>
        </div>
        <MachineMap
          shelves={SHELVES}
          tileFor={restockTile}
          selectedCode={isPicking ? null : selected}
          onSelect={isPicking ? () => setIsPicking(false) : setSelected}
        />
        <Button variant="text" className="justify-self-start">
          Mark the rest unchanged
        </Button>
      </Surface>
      <Surface>
        <h3 className="font-display text-heading text-ink">Read-only (Planogram)</h3>
        <MachineMap
          shelves={SHELVES.slice(0, 3)}
          tileFor={(slotCode) => ({
            value: "$1.75",
            productCount: SHARED.has(slotCode) ? 2 : 1,
            label: `${slotCode}: ${NAMES[slotCode] ?? "Fritos Original"}, $1.75`,
          })}
        />
      </Surface>
    </div>
  );
};

const FormPatternDemo = () => {
  const { draft, set, discard, isDirty } = useFormDraft({
    name: "7up - 12 oz",
    price: "2.00",
    isActive: true,
  });
  return (
    <div className="rounded-card border border-dashed border-line-strong">
      <div className="px-6 pt-6">
        <PageHeader
          eyebrow="Products / Edit product"
          title={draft.name || "Untitled product"}
          badge={<Badge tone={draft.isActive ? "success" : "neutral"}>{draft.isActive ? "Active" : "Inactive"}</Badge>}
          meta="Soda · In 2 machines · Last restocked Nov 5"
          aside={
            <a href="#form-pattern" className={pageLinkClass}>
              ← Back to products
            </a>
          }
        />
      </div>
      <form id="form-pattern" className="px-6" onSubmit={(event) => event.preventDefault()}>
        <FormSection title="Basics" description="What the product is called and how you find it when restocking.">
          <Field label="Name" hint='Include the size, e.g. "7up - 12 oz".'>
            <TextInput value={draft.name} onChange={(event) => set({ name: event.target.value })} />
          </Field>
        </FormSection>
        <FormSection title="Pricing" description="The default price for slots with this product.">
          <div className="max-w-[200px]">
            <Field label="Price">
              <MoneyInput value={draft.price} onChange={(event) => set({ price: event.target.value })} />
            </Field>
          </div>
        </FormSection>
        <FormSection title="Rules" description="How this product behaves during visits.">
          <Switch
            title="Active"
            description="Inactive products stay in history but drop out of search."
            isChecked={draft.isActive}
            onChange={(isActive) => set({ isActive })}
          />
        </FormSection>
      </form>
      <SaveBar
        isDirty={isDirty}
        saveLabel="Save changes"
        onDismiss={discard}
        formId="form-pattern"
      />
    </div>
  );
};

export const ComponentGallery = () => (
  <div className="grid gap-10">
    <Demo title="Type scale">
      <TypeScaleDemo />
    </Demo>
    <Demo title="Buttons">
      <ButtonsDemo />
    </Demo>
    <Demo title="Badges">
      <BadgesDemo />
    </Demo>
    <Demo title="Fields">
      <FieldsDemo />
    </Demo>
    <Demo title="Switch">
      <SwitchesDemo />
    </Demo>
    <Demo title="Chips">
      <ChipsDemo />
    </Demo>
    <Demo title="RowTable">
      <RowTableDemo />
    </Demo>
    <Demo title="FactsPanel">
      <FactsDemo />
    </Demo>
    <Demo title="Stepper">
      <StepperDemo />
    </Demo>
    <Demo title="MachineMap">
      <MachineMapDemo />
    </Demo>
    <Demo title="PageHeader · FormSection · SaveBar (edit a field to dirty it)">
      <FormPatternDemo />
    </Demo>
  </div>
);
