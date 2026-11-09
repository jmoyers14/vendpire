/** A calendar month in local time. `month` is 1–12. */
export interface Month {
  year: number;
  month: number;
}

export const monthOf = (date: Date): Month => ({
  year: date.getFullYear(),
  month: date.getMonth() + 1,
});

export const monthAfter = ({ year, month }: Month, offset: number): Month =>
  monthOf(new Date(year, month - 1 + offset, 1));

export const isSameMonth = (a: Month, b: Month): boolean =>
  a.year === b.year && a.month === b.month;

export const monthLabel = ({ year, month }: Month): string =>
  new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

/** The month's first and last local instants. */
export const monthRange = ({ year, month }: Month): { from: string; to: string } => {
  const next = new Date(year, month, 1);
  return {
    from: new Date(year, month - 1, 1).toISOString(),
    to: new Date(next.getTime() - 1).toISOString(),
  };
};
