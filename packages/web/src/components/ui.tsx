import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded border border-grey-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";

type PageWidth = "xl" | "2xl" | "3xl" | "4xl" | "6xl";

const MAX_WIDTH: Record<PageWidth, string> = {
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "6xl": "max-w-6xl",
};

// Centered page container with mobile-first padding (smaller on phones, roomier
// on desktop). Use the `max` prop to set content width; pass spacing via
// `className` since the gap between sections is screen-specific.
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
    className={`mx-auto ${MAX_WIDTH[max]} px-4 py-6 md:px-8 md:py-8 ${className}`}
  >
    {children}
  </div>
);

// Wrap a wide table so it scrolls horizontally on narrow screens instead of
// overflowing the viewport. The `rounded-lg`/border live here so corners clip.
export const TableScroll = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto rounded-lg border border-grey-200 shadow-sm">
    {children}
  </div>
);

export const ErrorNote = ({ message }: { message: string | null }) =>
  message ? (
    <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
  ) : null;
