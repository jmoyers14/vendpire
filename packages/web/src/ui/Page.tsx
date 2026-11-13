import type { ReactNode } from "react";

type PageWidth = "xl" | "2xl" | "3xl" | "4xl" | "6xl" | "form" | "wide";

const MAX_WIDTH: Record<PageWidth, string> = {
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "6xl": "max-w-6xl",
  form: "max-w-form lg:px-10 lg:py-10",
  wide: "max-w-wide lg:px-10 lg:py-10",
};

// Centered page container using the design system's gutter (px-4 sm:px-6).
// `form` (1080px) is for forms, `wide` (1320px) for data and flow pages.
// Sections inside should be spaced with flex/grid `gap`, not margins.
export const Page = ({
  max = "3xl",
  className = "",
  children,
}: {
  max?: PageWidth;
  className?: string;
  children: ReactNode;
}) => (
  <div
    className={`mx-auto ${MAX_WIDTH[max]} px-4 py-6 sm:px-6 ${className}`}
  >
    {children}
  </div>
);

/** @deprecated Use `<PageHeader title>`; kept for Packs and Settings until they move over. */
export const PageTitle = ({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <h1
    className={`font-display text-2xl font-extrabold text-ink ${className}`}
  >
    {children}
  </h1>
);

/** @deprecated Use `<PageHeader meta>`; kept for Settings until it moves over. */
export const PageSubtitle = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-gray-600">{children}</p>
);

/** @deprecated Use `<RowTable>`; kept for Packs until it moves over. */
export const TableScroll = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
    {children}
  </div>
);

/** @deprecated Use `<RowTableEmpty>`; kept for Packs until it moves over. */
export const EmptyState = ({ children }: { children: ReactNode }) => (
  <div className="rounded-card border border-dashed border-gray-300 p-8 text-center text-gray-600">
    {children}
  </div>
);
