import type { ReactNode } from "react";

type PageWidth = "xl" | "2xl" | "3xl" | "4xl" | "6xl";

const MAX_WIDTH: Record<PageWidth, string> = {
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "6xl": "max-w-6xl",
};

// Centered page container using the design system's gutter (px-4 sm:px-6).
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

export const PageTitle = ({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <h1
    className={`font-display text-2xl font-extrabold text-heading ${className}`}
  >
    {children}
  </h1>
);

// Secondary line under a page or card title.
export const PageSubtitle = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-gray-600">{children}</p>
);

// Wrap a wide table so it scrolls horizontally on narrow screens instead of
// overflowing the viewport. The radius and border live here so corners clip.
export const TableScroll = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
    {children}
  </div>
);

// Dashed placeholder shown where a list has no rows yet.
export const EmptyState = ({ children }: { children: ReactNode }) => (
  <div className="rounded-card border border-dashed border-gray-300 p-8 text-center text-gray-600">
    {children}
  </div>
);
