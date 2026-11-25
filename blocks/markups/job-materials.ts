// What a job's plans say it has (docs/materials-block.md §2, "Bring in from
// plans"): placed icons counted per level and icon number, with the price
// list item each number is linked to (from the quote's Take-off). The
// handover list adds these up by material. Icons marked "Just me" don't count.

import "server-only";
import type { JobMaterialRow } from "@grid/core";
import { db } from "@grid/db";
import { iconByKey, isCustomKey } from "./icons";

export async function jobMaterials({ companyId, projectId }: { companyId: string; projectId: string }): Promise<JobMaterialRow[]> {
  const [versions, sheets] = await Promise.all([
    db.jobIconVersion.findMany({ where: { companyId, projectId } }),
    db.planSheet.findMany({ where: { companyId, projectId, deletedAt: null }, select: { id: true, levelId: true } }),
  ]);
  if (!sheets.length) return [];
  const groups = await db.planMarkup.groupBy({
    by: ["sheetId", "iconKey", "iconNumber"],
    where: { companyId, projectId, kind: "ICON", deletedAt: null, visibility: { not: "JUST_ME" }, sheetId: { in: sheets.map((sheet) => sheet.id) } },
    _count: { _all: true },
  });
  const levelOf = new Map(sheets.map((sheet) => [sheet.id, sheet.levelId]));
  const version = new Map(versions.map((row) => [`${row.iconKey}#${row.number}`, row]));
  const numbered = new Set(versions.filter((row) => row.number > 1).map((row) => row.iconKey));
  const customIds = [...new Set(groups.flatMap((group) => (group.iconKey && isCustomKey(group.iconKey) ? [group.iconKey.slice("custom.".length)] : [])))];
  const custom = new Map((await db.customIcon.findMany({ where: { companyId, id: { in: customIds } }, select: { id: true, name: true } })).map((icon) => [`custom.${icon.id}`, icon.name]));

  const rows = new Map<string, JobMaterialRow>();
  for (const group of groups) {
    if (!group.iconKey) continue;
    const number = group.iconNumber ?? 1;
    const levelId = levelOf.get(group.sheetId) ?? null;
    const key = `${levelId ?? ""}|${group.iconKey}#${number}`;
    const row = rows.get(key);
    if (row) {
      row.qty += group._count._all;
      continue;
    }
    const linked = version.get(`${group.iconKey}#${number}`);
    const name = custom.get(group.iconKey) ?? iconByKey(group.iconKey)?.name ?? "Icon";
    const label = [numbered.has(group.iconKey) ? `${name} ${number}` : name, linked?.name ? `(${linked.name})` : null].filter(Boolean).join(" ");
    rows.set(key, { source: "PLANS", label, levelId, groupId: null, materialId: null, priceItemId: linked?.priceItemId ?? null, qty: group._count._all });
  }
  return [...rows.values()];
}
