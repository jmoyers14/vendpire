/**
 * Substring filter for a list that's already in memory.
 *
 * Every term must appear somewhere in the text, so "coke case" narrows rather
 * than widens — the same AND semantics as the purchase screen's catalog search,
 * so the two boxes behave alike. An empty query matches everything, which is
 * what makes it safe to filter unconditionally on every render.
 *
 * Deliberately does NOT rank: a table has a stable column order, and re-sorting
 * rows by relevance as you type would both disorient and throw away the
 * server's ordering.
 */
export const matchesSearch = (text: string, query: string): boolean => {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return true;
  }
  const haystack = text.toLowerCase();
  return terms.every((term) => haystack.includes(term));
};

/**
 * Lower is better. Ranks where the term lands, so "coke" puts "Coke Zero"
 * above "Diet Coke" above "Costco Coke Variety".
 */
const scoreTerm = (name: string, term: string): number | null => {
  const index = name.indexOf(term);
  if (index === -1) {
    return null;
  }
  if (index === 0) {
    return name.length === term.length ? 0 : 1;
  }
  return name[index - 1] === " " ? 2 : 3;
};

/**
 * Ranked search by name, with the same AND semantics as matchesSearch. Ties
 * break toward the shorter name — the more specific match. An empty query
 * matches nothing, since there is nothing to rank by.
 */
export const rankByName = <T extends { name: string }>(
  items: T[],
  query: string,
  limit: number,
): T[] => {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return [];
  }

  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const name = item.name.toLowerCase();
    let total = 0;
    let matchedAll = true;
    for (const term of terms) {
      const score = scoreTerm(name, term);
      if (score === null) {
        matchedAll = false;
        break;
      }
      total += score;
    }
    if (matchedAll) {
      scored.push({ item, score: total });
    }
  }

  return scored
    .sort((a, b) => a.score - b.score || a.item.name.length - b.item.name.length)
    .slice(0, limit)
    .map((entry) => entry.item);
};
