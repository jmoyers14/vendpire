/** Trimmed text, or null when nothing is left: how optional text fields are saved. */
export const nullIfBlank = (text: string): string | null => text.trim() || null;

/** "1 slot", "3 slots". Both forms are given so irregular phrases work too. */
export const plural = (
  count: number,
  { one, many }: { one: string; many: string },
): string => `${count} ${count === 1 ? one : many}`;
