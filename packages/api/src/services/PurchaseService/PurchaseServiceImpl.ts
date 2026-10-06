import { inject, injectable } from "tsyringe";
import { allocateProportionally } from "@vendpire/domain";
import {
  PACK_REPOSITORY_TOKEN,
  PRODUCT_REPOSITORY_TOKEN,
  PURCHASE_REPOSITORY_TOKEN,
} from "@vendpire/platform";
import type {
  PackRepository,
  ProductRepository,
  Purchase,
  PurchaseCursor,
  PurchaseInput,
  PurchaseLine,
  PurchaseRepository,
  PurchaseUpdate,
} from "@vendpire/platform";
import { ServiceError } from "../errors.ts";
import { decodePurchaseCursor, encodePurchaseCursor } from "./cursor.ts";
import {
  DEFAULT_PURCHASE_PAGE_SIZE,
  type PurchaseDraft,
  type PurchaseListOptions,
  type PurchaseListPage,
  type PurchasePackLine,
  type PurchaseService,
} from "./PurchaseService.ts";

/**
 * Purchase business rules. The important one: pack lines are expanded HERE,
 * not in a client. A receipt line of "2 × Frito-Lay 30ct variety, $37.98"
 * becomes one stored line per product, with the cost split by unit count —
 * so the stored facts are always per-product units and every client (web
 * today, iOS later) submits packs the same way without reimplementing the
 * money math.
 *
 * Also enforced: a purchase needs at least one line, every line's product
 * must exist, and any packId referenced must exist.
 */
@injectable()
export class PurchaseServiceImpl implements PurchaseService {
  constructor(
    @inject(PURCHASE_REPOSITORY_TOKEN)
    private readonly purchases: PurchaseRepository,
    @inject(PRODUCT_REPOSITORY_TOKEN)
    private readonly products: ProductRepository,
    @inject(PACK_REPOSITORY_TOKEN)
    private readonly packs: PackRepository,
  ) {}

  async list(
    orgId: string,
    options: PurchaseListOptions,
  ): Promise<PurchaseListPage> {
    let cursor: PurchaseCursor | null = null;
    if (options.cursor) {
      cursor = decodePurchaseCursor(options.cursor);
      if (!cursor) {
        throw new ServiceError("BAD_REQUEST", "Invalid cursor");
      }
    }

    const page = await this.purchases.findPageByOrg(orgId, {
      from: options.from ?? null,
      to: options.to ?? null,
      limit: options.limit ?? DEFAULT_PURCHASE_PAGE_SIZE,
      cursor,
    });

    // The next cursor is the POSITION of the last row handed out, never a
    // count — so a row written or removed behind the reader can't shift a page.
    const last = page.items.at(-1);
    return {
      items: page.items,
      nextCursor:
        page.hasMore && last
          ? encodePurchaseCursor({ purchasedAt: last.purchasedAt, id: last.id })
          : null,
    };
  }

  get(orgId: string, id: string): Promise<Purchase | null> {
    return this.purchases.findById(orgId, id);
  }

  async create(orgId: string, draft: PurchaseDraft): Promise<Purchase> {
    return this.purchases.create(orgId, {
      ...(await this.buildStored(orgId, draft)),
      clientRequestId: draft.clientRequestId ?? null,
    });
  }

  async update(
    orgId: string,
    id: string,
    draft: PurchaseDraft,
  ): Promise<Purchase> {
    // clientRequestId is deliberately absent from what an edit writes — the
    // PurchaseUpdate type is what enforces that. Rewriting it would strand the
    // key the submitting client still retries under, and that retry would then
    // create a SECOND purchase instead of getting this one back.
    const updated = await this.purchases.update(
      orgId,
      id,
      await this.buildStored(orgId, draft),
    );
    if (!updated) {
      throw new ServiceError("NOT_FOUND", "Purchase not found");
    }
    return updated;
  }

  async remove(orgId: string, id: string): Promise<void> {
    await this.purchases.softDelete(orgId, id);
  }

  /**
   * Turn a client draft into the stored shape: all lines, per product. Returns
   * the fields an edit may write, so `create` is the only caller that adds
   * `clientRequestId`.
   */
  private async buildStored(
    orgId: string,
    draft: PurchaseDraft,
  ): Promise<PurchaseUpdate> {
    const direct: PurchaseLine[] = draft.lines.map((line) => ({
      productId: line.productId,
      units: line.units,
      totalCostCents: line.totalCostCents,
      packId: line.packId ?? null,
    }));
    const expanded = await this.expandPackLines(orgId, draft.packLines ?? []);
    const lines = [...direct, ...expanded];

    if (lines.length === 0) {
      throw new ServiceError("BAD_REQUEST", "A purchase needs at least one line");
    }

    const productIds = [...new Set(lines.map((line) => line.productId))];
    const existingProducts = await this.products.findExistingIds(orgId, productIds);
    const missingProducts = productIds.filter((id) => !existingProducts.has(id));
    if (missingProducts.length > 0) {
      throw new ServiceError(
        "BAD_REQUEST",
        `Unknown product(s): ${missingProducts.join(", ")}`,
      );
    }

    // Provenance packIds on directly-submitted lines are still references —
    // validate them rather than trusting the client round-trip.
    const directPackIds = [
      ...new Set(
        direct
          .map((line) => line.packId)
          .filter((id): id is string => id !== null),
      ),
    ];
    for (const packId of directPackIds) {
      if (!(await this.packs.findById(orgId, packId))) {
        throw new ServiceError("BAD_REQUEST", `Unknown pack: ${packId}`);
      }
    }

    const notes = draft.notes?.trim();
    return {
      purchasedAt: draft.purchasedAt,
      vendor: draft.vendor.trim(),
      lines,
      receiptTotalCents: draft.receiptTotalCents ?? null,
      notes: notes ? notes : null,
    };
  }

  /**
   * One stored line per product per pack line. Units multiply by pack
   * quantity; the pack's total cost splits across its contents weighted by
   * unit count, using largest-remainder allocation so the lines sum EXACTLY
   * to what was paid.
   */
  private async expandPackLines(
    orgId: string,
    packLines: PurchasePackLine[],
  ): Promise<PurchaseLine[]> {
    const expanded: PurchaseLine[] = [];
    for (const packLine of packLines) {
      if (packLine.qty < 1) {
        throw new ServiceError("BAD_REQUEST", "Pack quantity must be at least 1");
      }
      const pack = await this.packs.findById(orgId, packLine.packId);
      if (!pack) {
        throw new ServiceError("BAD_REQUEST", `Unknown pack: ${packLine.packId}`);
      }
      const weights = pack.contents.map(
        (content) => content.units * packLine.qty,
      );
      const costs = allocateProportionally(packLine.totalCostCents, weights);
      pack.contents.forEach((content, index) => {
        expanded.push({
          productId: content.productId,
          units: content.units * packLine.qty,
          totalCostCents: costs[index] ?? 0,
          packId: pack.id,
        });
      });
    }
    return expanded;
  }
}
