// What a job's accepted quotes agreed (docs/materials-block.md §2, "Bring
// in from the accepted quote"): the material lines, with the optional
// extras only when the client chose them. The handover list adds these up
// by material. Accepted quotes can't be edited, so their lines are the
// ones that were signed, in the same order.

import "server-only";
import type { JobMaterialRow } from "@grid/core";
import { db } from "@grid/db";

export async function jobMaterials({ companyId, projectId }: { companyId: string; projectId: string }): Promise<JobMaterialRow[]> {
  const quotes = await db.quote.findMany({
    where: { companyId, projectId, status: "ACCEPTED", deletedAt: null },
    include: { lines: { orderBy: { sort: "asc" } } },
    orderBy: { acceptedAt: "asc" },
  });
  const itemIds = [...new Set(quotes.flatMap((quote) => quote.lines.flatMap((line) => (line.priceItemId ? [line.priceItemId] : []))))];
  const items = new Map((await db.priceItem.findMany({ where: { companyId, id: { in: itemIds } }, select: { id: true, kind: true, materialId: true } })).map((item) => [item.id, item]));
  const rows: JobMaterialRow[] = [];
  for (const quote of quotes) {
    const chosen = new Set(Array.isArray(quote.acceptedOptions) ? (quote.acceptedOptions as number[]) : []);
    quote.lines.forEach((line, index) => {
      if (line.optional && !chosen.has(index)) return;
      const item = line.priceItemId ? items.get(line.priceItemId) : undefined;
      // Labour and the like aren't on a handover sheet.
      if ((item?.kind ?? line.kind) !== "MATERIAL") return;
      rows.push({
        source: "QUOTE",
        label: `${quote.number}: ${line.description}`,
        levelId: null,
        groupId: quote.id,
        materialId: item?.materialId ?? null,
        priceItemId: line.priceItemId,
        qty: Number(line.qty),
        fromPlans: !!line.takeoffKey,
      });
    });
  }
  return rows;
}

/** The material behind each price list item (plan icons only know their item). */
export async function priceItemMaterials(companyId: string, priceItemIds: string[]): Promise<Record<string, string>> {
  const items = await db.priceItem.findMany({ where: { companyId, id: { in: [...new Set(priceItemIds)] }, materialId: { not: null } }, select: { id: true, materialId: true } });
  return Object.fromEntries(items.map((item) => [item.id, item.materialId!]));
}
