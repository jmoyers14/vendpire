/** "1 slot", "3 slots". Both forms are given so irregular phrases work too. */
export const plural = (
  count: number,
  { one, many }: { one: string; many: string },
): string => `${count} ${count === 1 ? one : many}`;
