// Deleting a business (docs/roadmap.md "Deleting a business"): quotes, the price book and tax settings.
// companyUsage is shown before someone deletes it; purgeCompany runs in the
// storage clean-up once Recently deleted has run out. Files go afterwards
// (the clean-up removes every StoredFile of the business), so only rows here.

import { rm } from "node:fs/promises";
import type { LevelUsage } from "@grid/core";
import { cacheRoot, db } from "@grid/db";

export async function companyUsage(companyId: string): Promise<LevelUsage[]> {
  const [quotes, items] = await Promise.all([
    db.quote.count({ where: { companyId, deletedAt: null } }),
    db.priceItem.count({ where: { companyId, deletedAt: null } }),
  ]);
  return [
    { count: quotes, one: "quote", many: "quotes" },
    { count: items, one: "price book item", many: "price book items" },
  ];
}

export async function purgeCompany(companyId: string): Promise<void> {
  const quoteIds = (await db.quote.findMany({ where: { companyId }, select: { id: true } })).map((quote) => quote.id);
  await db.$transaction(async (tx) => {
    // Lines, revisions and events go with each quote (cascade).
    await tx.quote.deleteMany({ where: { companyId } });
    await tx.priceItem.deleteMany({ where: { companyId } });
    await tx.taxSettings.deleteMany({ where: { companyId } });
    await tx.taxCode.deleteMany({ where: { companyId } });
    await tx.quoteUserSettings.deleteMany({ where: { companyId } });
  });
  // The PDF page pictures shown inside Grid (cache, so not files of the business).
  for (const id of quoteIds) await rm(cacheRoot("quotes", "pdf", id), { recursive: true, force: true });
}

/** A deleted job, for good: its quotes stay (they're the business's record), no longer linked to it. */
export async function purgeProject(projectId: string): Promise<string[]> {
  await db.quote.updateMany({ where: { projectId }, data: { projectId: null } });
  return [];
}
