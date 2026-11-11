import { type SlotCell, SlotFaceGrid } from "../../ui.tsx";
import { formatCents } from "../../utils/money.ts";
import type { ReviewCell, ReviewFace as ReviewFaceData } from "./reviewFaces.ts";

/**
 * One machine face for the review. Not `buildProductsCell`: a cell here shows
 * each product's price and units, and strikes through what the visit changed.
 */
export function ReviewFace({
  title,
  shelves,
  face,
  nameOf,
}: {
  title: string;
  shelves: string[][];
  face: ReviewFaceData;
  nameOf: (productId: string) => string;
}) {
  const renderCell = (slotCode: string): SlotCell => {
    const cell = face.get(slotCode);
    if (!cell) {
      return { state: "empty", content: <ReviewCellContent slotCode={slotCode} /> };
    }
    let state: SlotCell["state"] = "assigned";
    if (cell.isChanged) {
      state = "attention";
    } else if (cell.products.length === 0) {
      state = "empty";
    }
    return {
      state,
      content: <ReviewCellContent slotCode={slotCode} cell={cell} nameOf={nameOf} />,
      title: `${slotCode}: ${cell.products.map((product) => nameOf(product.productId)).join(", then ") || "empty"}`,
    };
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h3 className="text-xs font-bold uppercase text-muted">{title}</h3>
      <SlotFaceGrid shelves={shelves} renderCell={renderCell} />
    </div>
  );
}

function ReviewCellContent({
  slotCode,
  cell,
  nameOf,
}: {
  slotCode: string;
  cell?: ReviewCell;
  nameOf?: (productId: string) => string;
}) {
  const products = cell?.products ?? [];
  const removedProducts = cell?.removedProducts ?? [];
  return (
    <>
      <div className="font-mono text-[10px] text-muted">
        {slotCode}
        {products.length > 1 ? (
          <span className="ml-1 rounded bg-primary-50 px-1 text-primary-700">
            {products.length}
          </span>
        ) : null}
      </div>
      {removedProducts.map((product) => (
        <div
          key={product.productId}
          className="truncate text-[11px] text-gray-500 line-through"
        >
          {nameOf?.(product.productId)}
        </div>
      ))}
      {products.length === 0 && removedProducts.length === 0 ? (
        <div className="text-[10px] text-gray-400">—</div>
      ) : null}
      {products.map((product, index) => (
        <div key={product.productId}>
          <div
            className={`truncate text-[11px] ${
              index === 0 ? "font-medium text-gray-800" : "text-gray-600"
            }`}
          >
            {nameOf?.(product.productId)}
          </div>
          <div className="text-[10px] tabular-nums text-gray-600">
            {product.wasPriceCents === null ? null : (
              <span className="mr-1 text-gray-500 line-through">
                {formatCents(product.wasPriceCents)}
              </span>
            )}
            {formatCents(product.priceCents)} · {product.units ?? "—"}
          </div>
        </div>
      ))}
    </>
  );
}
