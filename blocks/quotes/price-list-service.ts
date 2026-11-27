// Supplier price lists (docs/quotations-block.md "Supplier price lists"):
// the import screen reads the file in the browser and sends the products;
// this works out what they'd change in the price book (preview) and saves
// it all at once (apply). Each cost or sell price that changes gets a
// PriceChange row for the item's price history.

import { badRequest, forbidden, requireCompany, type RequestContext } from "@grid/core";
import { audit, db, type Prisma } from "@grid/db";
import { codeKey, planPriceList, sellWithMarkup, supplierKey, type PlanItem, type PriceListPlan, type SavedColumns, type SellPrices } from "./price-list";
import type { ApplyPriceListInput, PreviewPriceListInput } from "./validation";

const MOD = "quotes";

/** Importing sets buy prices, so it needs both changing the price book and seeing costs. */
function requireImport(ctx: RequestContext) {
  if (!ctx.permissions.has("quotes.pricebook.manage")) throw forbidden("You can't change the price book");
  if (!ctx.permissions.has("quotes.costs.view")) throw forbidden("Importing a price list sets buy prices, and you can't see costs");
}

export interface SupplierListJson {
  id: string | null;
  supplier: string;
  columns: SavedColumns;
  sellPrices: SellPrices;
  newItemMarkup: number | null;
  lastImportedAt: Date | null;
  lastFileName: string | null;
  /** Price book items from this supplier. */
  itemCount: number;
}

/**
 * The suppliers to pick from: ones imported before (with their saved
 * columns), then any other supplier named on price book items.
 */
export async function listSupplierLists(ctx: RequestContext): Promise<SupplierListJson[]> {
  const companyId = requireCompany(ctx);
  const [saved, named] = await Promise.all([
    db.supplierPriceList.findMany({ where: { companyId, deletedAt: null }, orderBy: [{ lastImportedAt: { sort: "desc", nulls: "last" } }, { supplier: "asc" }] }),
    db.priceItem.groupBy({ by: ["supplier"], where: { companyId, deletedAt: null, supplier: { not: null } }, _count: { _all: true } }),
  ]);
  const counts = new Map<string, number>();
  const spelling = new Map<string, string>();
  for (const group of named) {
    const key = supplierKey(group.supplier!);
    counts.set(key, (counts.get(key) ?? 0) + group._count._all);
    if (!spelling.has(key)) spelling.set(key, group.supplier!);
  }
  const lists: SupplierListJson[] = saved.map((list) => ({
    id: list.id,
    supplier: list.supplier,
    columns: (list.columns ?? {}) as SavedColumns,
    sellPrices: list.sellPrices === "KEEP_SELL" ? "KEEP_SELL" : "KEEP_MARKUP",
    newItemMarkup: list.newItemMarkup == null ? null : Number(list.newItemMarkup),
    lastImportedAt: list.lastImportedAt,
    lastFileName: list.lastFileName,
    itemCount: counts.get(supplierKey(list.supplier)) ?? 0,
  }));
  const known = new Set(lists.map((list) => supplierKey(list.supplier)));
  for (const [key, name] of [...spelling].sort((first, second) => first[1].localeCompare(second[1]))) {
    if (known.has(key)) continue;
    lists.push({ id: null, supplier: name, columns: {}, sellPrices: "KEEP_MARKUP", newItemMarkup: null, lastImportedAt: null, lastFileName: null, itemCount: counts.get(key) ?? 0 });
  }
  return lists;
}

/** Price book items with a supplier code, for matching. */
async function planItems(companyId: string, tx: Prisma.TransactionClient | typeof db = db): Promise<PlanItem[]> {
  const items = await tx.priceItem.findMany({
    where: { companyId, deletedAt: null, supplierCode: { not: null } },
    select: { id: true, name: true, supplier: true, supplierCode: true, cost: true, sell: true },
  });
  return items.map((item) => ({ ...item, cost: item.cost == null ? null : Number(item.cost), sell: Number(item.sell) }));
}

export interface PriceListPreview extends PriceListPlan {
  /** Price book items from this supplier now. */
  supplierItems: number;
}

/** Import, step 1: what the list would change. Nothing is saved. */
export async function previewPriceList(ctx: RequestContext, input: PreviewPriceListInput): Promise<PriceListPreview> {
  const companyId = requireCompany(ctx);
  requireImport(ctx);
  const items = await planItems(companyId);
  const plan = planPriceList(input.supplier, input.rows.map(([code, cost]) => ({ code, cost })), items, input.sellPrices);
  const thisSupplier = supplierKey(input.supplier);
  return { ...plan, supplierItems: items.filter((item) => item.supplier && supplierKey(item.supplier) === thisSupplier).length };
}

export interface PriceListResult {
  costsChanged: number;
  sellPricesChanged: number;
  added: number;
  unchanged: number;
}

/**
 * Import, step 2: save it, all or nothing. The plan is worked out again
 * from the list and the price book as they are now. Items picked to add
 * become materials from this supplier (their brand is found or added).
 * The supplier's columns and choices are saved for next time.
 */
export async function applyPriceList(ctx: RequestContext, input: ApplyPriceListInput): Promise<PriceListResult> {
  const companyId = requireCompany(ctx);
  requireImport(ctx);
  const supplier = input.supplier.trim();
  if (!supplier) throw badRequest("Say which supplier the list is from");

  return db.$transaction(
    async (tx) => {
      const items = await planItems(companyId, tx);
      const plan = planPriceList(supplier, input.rows.map(([code, cost]) => ({ code, cost })), items, input.sellPrices);
      const history: Prisma.PriceChangeCreateManyInput[] = [];
      const result: PriceListResult = { costsChanged: 0, sellPricesChanged: 0, added: 0, unchanged: plan.unchanged };

      for (const change of plan.changes) {
        await tx.priceItem.update({
          where: { id: change.itemId },
          data: { cost: change.costAfter, sell: change.sellAfter, ...(change.setsSupplier ? { supplier } : {}) },
        });
        const costMoved = change.costBefore !== change.costAfter;
        const sellMoved = change.sellBefore !== change.sellAfter;
        if (costMoved) result.costsChanged++;
        if (sellMoved) result.sellPricesChanged++;
        if (costMoved || sellMoved) {
          history.push({
            companyId,
            priceItemId: change.itemId,
            costBefore: change.costBefore,
            costAfter: change.costAfter,
            sellBefore: change.sellBefore,
            sellAfter: change.sellAfter,
            source: "IMPORT",
            supplier,
            fileName: input.fileName,
            changedById: ctx.userId,
          });
        }
      }

      // New items picked from the list. A code already in the price book (for this supplier) is left alone.
      if (input.add.length) {
        const taken = new Set(items.filter((item) => !item.supplier || supplierKey(item.supplier) === supplierKey(supplier)).map((item) => codeKey(item.supplierCode!)));
        const settings = await tx.taxSettings.findUnique({ where: { companyId }, select: { defaultTaxCodeId: true } });
        const brands = await tx.priceBrand.findMany({ where: { companyId, deletedAt: null }, select: { id: true, name: true } });
        const brandIds = new Map(brands.map((brand) => [brand.name.toLowerCase(), brand.id]));
        for (const product of input.add) {
          const key = codeKey(product.code);
          if (!key || taken.has(key)) continue;
          taken.add(key);
          let brandId: string | null = null;
          if (product.brand) {
            brandId = brandIds.get(product.brand.toLowerCase()) ?? null;
            if (!brandId) {
              const brand = await tx.priceBrand.create({ data: { companyId, name: product.brand.slice(0, 60) }, select: { id: true, name: true } });
              brandIds.set(brand.name.toLowerCase(), brand.id);
              brandId = brand.id;
              await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "PriceBrand", entityId: brand.id, action: "created", diff: { name: brand.name, fromPriceList: supplier } });
            }
          }
          const sell = sellWithMarkup(product.cost, input.newItemMarkup);
          const item = await tx.priceItem.create({
            data: {
              companyId,
              kind: "MATERIAL",
              name: product.description.slice(0, 200),
              unit: product.unit ?? "each",
              cost: product.cost,
              sell,
              taxCodeId: settings?.defaultTaxCodeId ?? null,
              supplier,
              supplierCode: product.code.slice(0, 100),
              brandId,
            },
            select: { id: true },
          });
          history.push({ companyId, priceItemId: item.id, costBefore: null, costAfter: product.cost, sellBefore: null, sellAfter: sell, source: "ADDED", supplier, fileName: input.fileName, changedById: ctx.userId });
          result.added++;
        }
      }

      if (history.length) await tx.priceChange.createMany({ data: history });

      // Remember this supplier's columns and choices for next time.
      const saved = await tx.supplierPriceList.findMany({ where: { companyId, deletedAt: null }, select: { id: true, supplier: true } });
      const existing = saved.find((list) => supplierKey(list.supplier) === supplierKey(supplier));
      const remembered = {
        supplier,
        columns: input.columns as Prisma.InputJsonValue,
        sellPrices: input.sellPrices,
        newItemMarkup: input.newItemMarkup,
        lastImportedAt: new Date(),
        lastFileName: input.fileName,
      };
      if (existing) await tx.supplierPriceList.update({ where: { id: existing.id }, data: remembered });
      else await tx.supplierPriceList.create({ data: { companyId, ...remembered } });

      // One entry for the whole import; each item's change is in its price history.
      await audit(tx, {
        blockId: MOD,
        actorId: ctx.userId,
        companyId,
        entityType: "PriceList",
        entityId: existing?.id ?? companyId,
        action: "imported",
        diff: { supplier, fileName: input.fileName, ...result, sellPrices: input.sellPrices },
      });
      return result;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

export interface PriceChangeJson {
  at: Date;
  costBefore: number | null;
  costAfter: number | null;
  sellBefore: number | null;
  sellAfter: number | null;
  source: string;
  supplier: string | null;
  fileName: string | null;
  by: string;
}

/** An item's price history, newest first. */
export async function priceHistory(ctx: RequestContext, itemId: string): Promise<PriceChangeJson[]> {
  const companyId = requireCompany(ctx);
  if (!ctx.permissions.has("quotes.costs.view")) throw forbidden("You can't see costs");
  const changes = await db.priceChange.findMany({ where: { companyId, priceItemId: itemId }, orderBy: { changedAt: "desc" }, take: 100 });
  const people = await db.user.findMany({ where: { id: { in: [...new Set(changes.map((change) => change.changedById))] } }, select: { id: true, name: true } });
  const names = new Map(people.map((person) => [person.id, person.name]));
  const number = (amount: Prisma.Decimal | null) => (amount == null ? null : Number(amount));
  return changes.map((change) => ({
    at: change.changedAt,
    costBefore: number(change.costBefore),
    costAfter: number(change.costAfter),
    sellBefore: number(change.sellBefore),
    sellAfter: number(change.sellAfter),
    source: change.source,
    supplier: change.supplier,
    fileName: change.fileName,
    by: names.get(change.changedById) ?? "Someone",
  }));
}
