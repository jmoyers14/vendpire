/**
 * Read-only machine-face rendering for ANY slot layout: one strip of cells per
 * shelf, all shelves spanning equal width. Used by the manual-entry mode (and
 * later by planogram/visit screens) so a layout is always visible as a grid,
 * however its codes were authored.
 */
export function SlotFacePreview({ shelves }: { shelves: string[][] }) {
  if (shelves.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1.5 rounded-md bg-grey-100 p-2">
      {shelves.map((shelf, index) => (
        <div key={index} className="flex gap-1">
          {shelf.map((code, i) => (
            <div
              key={`${code}-${i}`}
              className="flex-1 rounded border border-grey-300 bg-white py-1.5 text-center font-mono text-xs text-grey-700"
            >
              {code}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
