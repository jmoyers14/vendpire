import { parseDollarsToCents } from "../../utils/money.ts";

/**
 * The product form's draft and how it becomes what the API takes. Pure, so
 * the rules are tested without a browser.
 */

/** Strings because they back inputs; parsed only on save. */
export interface ProductDraft {
  name: string;
  category: string;
  upc: string;
  taxClass: string;
  price: string;
  imageUrl: string | null;
  isActive: boolean;
  tracksExpiration: boolean;
}

export const EMPTY_PRODUCT_DRAFT: ProductDraft = {
  name: "",
  category: "",
  upc: "",
  taxClass: "",
  price: "",
  imageUrl: null,
  isActive: true,
  tracksExpiration: true,
};

export interface ProductInput {
  name: string;
  category: string;
  upc: string | null;
  taxClass: string | null;
  imageUrl: string | null;
  defaultPriceCents: number;
  active: boolean;
  tracksExpiration: boolean;
}

export type ProductFieldErrors = Partial<Record<"name" | "category" | "price", string>>;

/** The draft as the API takes it, or an error under each field that's wrong. */
export const buildProductInput = (
  draft: ProductDraft,
): { input: ProductInput } | { errors: ProductFieldErrors } => {
  const errors: ProductFieldErrors = {};
  if (draft.name.trim() === "") {
    errors.name = "Enter a name";
  }
  if (draft.category.trim() === "") {
    errors.category = "Enter a category";
  }
  const defaultPriceCents = parseDollarsToCents(draft.price);
  if (defaultPriceCents === null) {
    errors.price = "Price must be a dollar amount, e.g. 1.75";
  }
  if (defaultPriceCents === null || Object.keys(errors).length > 0) {
    return { errors };
  }
  return {
    input: {
      name: draft.name.trim(),
      category: draft.category.trim(),
      upc: draft.upc.trim() || null,
      taxClass: draft.taxClass.trim() || null,
      imageUrl: draft.imageUrl,
      defaultPriceCents,
      active: draft.isActive,
      tracksExpiration: draft.tracksExpiration,
    },
  };
};

/** Categories already in use, A–Z without repeats, to suggest as you type. */
export const categorySuggestionsFor = (products: readonly { category: string }[]): string[] =>
  [...new Set(products.map((product) => product.category.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
