import type { ReactNode } from "react";

/**
 * A titled group of fields: title and one-line description on the left, the
 * fields in a card on the right. Consecutive sections are divided by a rule.
 * Below `lg` the two columns stack; `layout="stacked"` keeps them stacked at
 * every width, for a form whose tables need the full row.
 */
export const FormSection = ({
  title,
  description,
  layout = "split",
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  layout?: "split" | "stacked";
  children: ReactNode;
}) => (
  <section
    className={`grid gap-4 border-t border-line py-8 first:border-t-0 ${
      layout === "split" ? "lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10" : ""
    }`}
  >
    <div>
      <h2 className="font-display text-heading text-ink">{title}</h2>
      {description ? (
        <p className="mt-1.5 text-body-sm text-muted-strong">{description}</p>
      ) : null}
    </div>
    <div className="grid min-w-0 gap-6 rounded-card border border-line bg-card p-6 shadow-card">
      {children}
    </div>
  </section>
);

/** Fields that share a row inside a section; collapses to one column on phones. */
export const FieldRow = ({ children }: { children: ReactNode }) => (
  <div className="grid gap-5 sm:grid-cols-2">{children}</div>
);

/** A hairline between groups inside one section card. */
export const SectionDivider = () => <hr className="border-divider" />;
