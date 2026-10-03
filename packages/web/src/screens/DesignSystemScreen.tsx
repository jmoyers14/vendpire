import {
  Alert,
  Button,
  Card,
  CardTitle,
  EmptyState,
  hintClass,
  InfoHint,
  inputClass,
  KpiCard,
  KpiGrid,
  labelClass,
  Page,
  PageSubtitle,
  PageTitle,
  SlotList,
  SlotRow,
  StatusPill,
  stockTone,
} from "../components/ui.tsx";

/**
 * Living reference for the design system — every primitive rendered in one
 * place so a change to theme.css can be eyeballed against the whole set.
 * Not linked from the nav; reachable at /design.
 */

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="grid gap-2.5">
    <CardTitle>{title}</CardTitle>
    {children}
  </section>
);

const SCALES = ["primary", "gray", "green", "red", "amber"] as const;
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

// Tailwind only generates classes it can see as literal strings, so the swatch
// grid spells out every bg-* class rather than building them at runtime.
const SWATCH: Record<(typeof SCALES)[number], string[]> = {
  primary: [
    "bg-primary-50", "bg-primary-100", "bg-primary-200", "bg-primary-300",
    "bg-primary-400", "bg-primary-500", "bg-primary-600", "bg-primary-700",
    "bg-primary-800", "bg-primary-900",
  ],
  gray: [
    "bg-gray-50", "bg-gray-100", "bg-gray-200", "bg-gray-300",
    "bg-gray-400", "bg-gray-500", "bg-gray-600", "bg-gray-700",
    "bg-gray-800", "bg-gray-900",
  ],
  green: [
    "bg-green-50", "bg-green-100", "bg-green-200", "bg-green-300",
    "bg-green-400", "bg-green-500", "bg-green-600", "bg-green-700",
    "bg-green-800", "bg-green-900",
  ],
  red: [
    "bg-red-50", "bg-red-100", "bg-red-200", "bg-red-300",
    "bg-red-400", "bg-red-500", "bg-red-600", "bg-red-700",
    "bg-red-800", "bg-red-900",
  ],
  amber: [
    "bg-amber-50", "bg-amber-100", "bg-amber-200", "bg-amber-300",
    "bg-amber-400", "bg-amber-500", "bg-amber-600", "bg-amber-700",
    "bg-amber-800", "bg-amber-900",
  ],
};

const SLOTS = [
  { code: "A1", name: "Cheez-It Original", remaining: 9, capacity: 12 },
  { code: "A2", name: "Snickers", remaining: 3, capacity: 12 },
  { code: "B1", name: "Diet Coke 12oz", remaining: 0, capacity: 10 },
];

export function DesignSystemScreen() {
  return (
    <Page max="4xl" className="grid gap-6">
      <div className="grid gap-1">
        <PageTitle>Design system</PageTitle>
        <PageSubtitle>
          Lagoon teal · light mode only · every primitive on one page
        </PageSubtitle>
      </div>

      <Section title="Color scales">
        <Card className="grid gap-2 p-3">
          {SCALES.map((scale) => (
            <div key={scale} className="grid gap-1">
              <span className="text-xs uppercase tracking-wider text-gray-600">
                {scale}
              </span>
              <div className="flex gap-1">
                {SWATCH[scale].map((cls, i) => (
                  <div key={cls} className="grid flex-1 gap-1 text-center">
                    <div
                      className={`h-9 rounded-md border border-line ${cls}`}
                    />
                    <span className="font-mono text-[10px] text-muted">
                      {STEPS[i]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Typography">
        <Card className="grid gap-2 p-3">
          <p className="font-display text-2xl font-extrabold text-heading">
            Page title · font-display 2xl extrabold
          </p>
          <p className="font-display text-lg font-extrabold text-heading">
            Card title · font-display lg extrabold
          </p>
          <p className="text-base text-body">Body · text-base text-body</p>
          <p className="text-sm text-gray-600">Secondary · text-sm gray-600</p>
          <p className="font-mono text-xs text-muted">
            Slot code · font-mono xs muted — A1 B2 C3
          </p>
          <p className="font-display text-2xl font-extrabold tabular-nums text-profit">
            +$171.40
          </p>
          <p className="font-display text-2xl font-extrabold tabular-nums text-loss">
            −$36.08
          </p>
        </Card>
      </Section>

      <Section title="Buttons">
        <Card className="grid gap-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="outline">Outline</Button>
            <span className="inline-flex items-center gap-1 text-sm text-body">
              Info hint
              <InfoHint text="Explains a field without a permanent line of helper text under it." />
            </span>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Primary sm</Button>
            <Button size="sm" variant="secondary">
              Secondary sm
            </Button>
            <Button size="sm" variant="danger">
              Danger sm
            </Button>
          </div>
          <Button full>Start fill visit</Button>
        </Card>
      </Section>

      <Section title="Status pills">
        <Card className="flex flex-wrap gap-2 p-3">
          <StatusPill tone="ok">9 / 12</StatusPill>
          <StatusPill tone="warning">Fill due</StatusPill>
          <StatusPill tone="critical">Out of stock</StatusPill>
        </Card>
      </Section>

      <Section title="Alerts">
        <Alert tone="warning" title="2 machines due for a fill">
          Breakroom · Bldg B and Lobby · Bldg A were last filled 6 days ago.
        </Alert>
        <Alert tone="critical" title="Coin mech jam reported">
          Machine #04 — reported this morning.
        </Alert>
        <Alert tone="success" title="Visit reconciled">
          Counts matched the receipt.
        </Alert>
      </Section>

      <Section title="KPI cards">
        <KpiGrid>
          <KpiCard label="Month profit" value="+$1,284" tone="profit" />
          <KpiCard label="Spoilage" value="−$36" tone="loss" />
          <KpiCard label="Sales, 7 days" value="$412" />
          <KpiCard label="Gross margin" value="48%" />
        </KpiGrid>
      </Section>

      <Section title="Slot list">
        <SlotList>
          {SLOTS.map((slot) => (
            <SlotRow
              key={slot.code}
              code={slot.code}
              label={slot.name}
              status={
                <StatusPill tone={stockTone(slot.remaining, slot.capacity)}>
                  {slot.remaining} / {slot.capacity}
                </StatusPill>
              }
            />
          ))}
        </SlotList>
      </Section>

      <Section title="Form controls">
        <Card className="grid gap-2 p-3">
          <label className="grid gap-1">
            <span className={labelClass}>Machine name</span>
            <input className={inputClass} placeholder="Breakroom · Bldg B" />
            <span className={hintClass}>
              Shown on the route list and every report.
            </span>
          </label>
        </Card>
      </Section>

      <Section title="Empty state">
        <EmptyState>
          No machines yet. Add a location first, then{" "}
          <span className="font-bold">Add Machine</span>.
        </EmptyState>
      </Section>
    </Page>
  );
}
