import type { ReactNode } from "react";
import { focusRing } from "./focus.ts";

/** For the eyebrow's breadcrumb links. */
export const eyebrowLinkClass = `rounded-sm text-muted-strong hover:underline ${focusRing}`;

/** For the link on the right ("← Back to products", "History →"). */
export const pageLinkClass = `whitespace-nowrap rounded-sm py-2.5 text-button text-link hover:underline ${focusRing}`;

/**
 * The top of every page. On edit and detail pages `title` is the record's
 * name ("7up - 12 oz"), not the action ("Edit product"); the eyebrow carries
 * the action.
 */
export const PageHeader = ({
  eyebrow,
  title,
  badge,
  meta,
  aside,
}: {
  /** Breadcrumb, e.g. "Products / Edit product", linking back to the list. */
  eyebrow?: ReactNode;
  title: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  /** The link on the right; name its destination. */
  aside?: ReactNode;
}) => (
  <header className="flex items-start justify-between gap-6">
    <div className="grid min-w-0 gap-1">
      {eyebrow ? (
        <p className="text-label text-muted-strong">{eyebrow}</p>
      ) : null}
      <h1 className="font-display text-display text-ink">{title}</h1>
      {badge || meta ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-body-sm text-muted-strong">
          {badge}
          {meta}
        </div>
      ) : null}
    </div>
    {aside ? <div className="flex-none">{aside}</div> : null}
  </header>
);
