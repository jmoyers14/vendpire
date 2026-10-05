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
