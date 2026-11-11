import type { ReactNode } from "react";
import { Button, Card } from "../../ui.tsx";

/** The right-hand card that edits one slot (or, in Review, the whole visit). */
export const EditorCard = ({
  label,
  children,
}: {
  /** Accessible name, e.g. "Count slot B4". */
  label: string;
  children: ReactNode;
}) => (
  <section aria-label={label} className="min-w-0">
    <Card className="grid gap-6 border border-line p-6 lg:px-8 lg:py-7">{children}</Card>
  </section>
);

/**
 * Slot badge, where the slot is, the product name(s) one per line, and the
 * price block on the right.
 */
export const SlotEditorHeader = ({
  slotCode,
  shelfLabel,
  productNames,
  subtitle,
  price,
}: {
  slotCode: string;
  shelfLabel: string;
  productNames: string[];
  subtitle?: ReactNode;
  price: ReactNode;
}) => {
  const note =
    productNames.length > 1
      ? `Row ${shelfLabel} · ${productNames.length} products share this slot`
      : `Row ${shelfLabel}`;
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-divider pb-6">
      <div className="grid min-w-0 gap-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-[26px] items-center rounded-full bg-divider px-2.5 font-mono text-body-sm font-medium text-ink">
            {slotCode}
          </span>
          <span className="text-body-sm text-muted-strong">
            {productNames.length === 0 ? "No product loaded" : note}
          </span>
        </div>
        <h2 className="font-display text-title text-ink">
          {productNames.length === 0
            ? "Empty slot"
            : productNames.map((name) => (
                <span key={name} className="block">
                  {name}
                </span>
              ))}
        </h2>
        {subtitle ? (
          <p className="text-body-sm text-muted-strong tabular-nums">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex-none sm:min-w-[140px] sm:text-right">{price}</div>
    </header>
  );
};

export const PriceLabel = ({ children }: { children: ReactNode }) => (
  <div className="text-overline text-muted-strong uppercase">{children}</div>
);

/** A dashed note where the editor has nothing to ask: an empty slot, or one to count first. */
export const EditorNotice = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-dashed border-line-strong bg-app p-5 text-body text-ink-soft">
    {children}
  </div>
);

/** A tinted inset inside the editor for one action: Add stock, Pull, Move. */
export const EditorInset = ({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: ReactNode;
}) => (
  <div className="grid gap-4 rounded-panel border border-line bg-app p-5">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-body font-bold text-ink">{title}</h3>
      <Button variant="text" onClick={onCancel}>
        Cancel
      </Button>
    </div>
    {children}
  </div>
);

/** Hint on the left, Previous / Next on the right. */
export const EditorFooter = ({
  hint,
  children,
}: {
  hint: ReactNode;
  children: ReactNode;
}) => (
  <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-divider pt-5">
    <div className="flex flex-wrap items-center gap-1.5 text-body-sm text-muted-strong">
      {hint}
    </div>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </footer>
);
