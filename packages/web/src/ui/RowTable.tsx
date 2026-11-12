import type { CSSProperties, ReactNode } from "react";

/**
 * Repeating rows of inputs on a CSS grid, so every row's columns line up with
 * the header without a <table>. Inputs inside need their own aria-label: the
 * header is visual only.
 *
 * `boxed` is a bordered panel with a tinted header (Log Purchase items);
 * `plain` sits inside a card with just rules between rows (a slot's products).
 */
export type RowTableVariant = "boxed" | "plain";

export const RowTable = ({
  columns,
  variant = "boxed",
  minWidth,
  className = "",
  children,
}: {
  /** A grid-template-columns value, e.g. "minmax(0,1fr) 128px 140px 40px". */
  columns: string;
  variant?: RowTableVariant;
  /**
   * Below this width the table scrolls sideways instead of crushing its
   * columns, e.g. "520px" for a phone.
   */
  minWidth?: string;
  className?: string;
  children: ReactNode;
}) => {
  const table = (
    <div
      data-variant={variant}
      style={{ "--row-columns": columns, minWidth } as CSSProperties}
      className={`group/rows ${variant === "boxed" ? "overflow-hidden rounded-panel border border-line" : ""} ${minWidth ? "" : className}`}
    >
      {children}
    </div>
  );
  if (!minWidth) {
    return table;
  }
  // Relative so visually hidden labels (absolutely positioned) scroll with the table
  // instead of escaping it and widening the page.
  return <div className={`relative min-w-0 overflow-x-auto ${className}`}>{table}</div>;
};

const ROW = "grid grid-cols-(--row-columns) items-center gap-3";
const INSET = "group-data-[variant=boxed]/rows:px-4";

export const RowTableHeader = ({ children }: { children: ReactNode }) => (
  <div
    className={`${ROW} ${INSET} border-b border-line pb-2 text-overline text-muted-strong uppercase group-data-[variant=boxed]/rows:border-divider group-data-[variant=boxed]/rows:bg-app group-data-[variant=boxed]/rows:pt-2.5 group-data-[variant=boxed]/rows:pb-2.5`}
  >
    {children}
  </div>
);

export const RowTableBody = ({ children }: { children: ReactNode }) => (
  <div className="divide-y divide-divider">{children}</div>
);

export const RowTableRow = ({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <div className={`${ROW} ${INSET} py-3.5 group-data-[variant=boxed]/rows:py-3 ${className}`}>
    {children}
  </div>
);

export const RowTableFooter = ({ children }: { children: ReactNode }) => (
  <div
    className={`${ROW} ${INSET} border-t border-line pt-3 font-bold text-ink group-data-[variant=boxed]/rows:bg-app group-data-[variant=boxed]/rows:pb-3`}
  >
    {children}
  </div>
);

/** The header is visual only, so each cell in a read-only row names itself for screen readers. */
export const RowTableCellLabel = ({ children }: { children: string }) => (
  <span className="sr-only">{children}: </span>
);

/** Shown in the body when there are no rows yet. */
export const RowTableEmpty = ({ children }: { children: ReactNode }) => (
  <p className="px-4 py-7 text-center text-body text-muted-strong">{children}</p>
);
