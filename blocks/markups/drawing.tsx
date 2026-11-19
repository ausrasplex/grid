// Markups' part of a shared plan link and a plan PDF (the `planDrawing`
// hook, docs/plans-block.md "Sharing plans"): the markups, measurements
// and icons on the chosen layers, as SVG in sheet units. Drawn with the
// same pieces as the live viewer (ui/shapes.tsx). Never "Just me" ones.

import "server-only";
import type { PlanDrawingInput } from "@grid/core";
import { db } from "@grid/db";
import { scaleFor, showsOn, type MarkupKind, type Point } from "./geometry";
import { iconLookup, type CustomIconRow } from "./icons";
import { MarkupShape, MeasureLabel, PlacedIcon } from "./ui/shapes";

/** Measurement labels on a shared sheet: about 1% of the sheet's width. */
const LABEL_SIZE = 0.009;

export async function planDrawing(input: PlanDrawingInput): Promise<string> {
  if (input.viewer && !input.viewer.permissions.has("markups.view")) return "";
  const layerFilter = [...(input.layerIds.length ? [{ layerId: { in: input.layerIds } }] : []), ...(input.withDefault ? [{ layerId: null }] : [])];
  if (!layerFilter.length) return "";
  const [rows, scales, customs, numbers] = await Promise.all([
    db.planMarkup.findMany({
      where: { companyId: input.companyId, sheetId: input.sheetId, deletedAt: null, visibility: { not: "JUST_ME" }, OR: layerFilter },
      orderBy: { createdAt: "asc" },
      take: 5000,
    }),
    db.planScale.findMany({ where: { companyId: input.companyId, sheetId: input.sheetId } }),
    db.customIcon.findMany({ where: { companyId: input.companyId } }),
    db.jobIconVersion.groupBy({ by: ["iconKey"], where: { companyId: input.companyId, projectId: input.projectId }, _count: { _all: true } }),
  ]);
  const markups = showsOn(
    rows.map((row) => ({ ...row, points: row.points as Point[], kind: row.kind as MarkupKind })),
    input.versionId,
    input.versions,
  );
  if (!markups.length) return "";
  const scale = scaleFor(input.versionId, input.versions, scales.map((row) => ({ versionId: row.versionId, metresPerUnit: row.metresPerUnit, method: row.method, ratio: row.ratio })));
  const lookup = iconLookup(
    customs.map(
      (row): CustomIconRow => ({
        id: row.id,
        name: row.name,
        trade: row.trade,
        outline: row.outline,
        label: row.label,
        words: row.words,
        svg: row.svg,
        tint: row.tint,
        replacesKey: row.replacesKey,
        deleted: !!row.deletedAt,
      }),
    ),
  );
  // An icon shows its number once the job has two or more of it.
  const numbered = new Set(numbers.filter((group) => group._count._all >= 2).map((group) => group.iconKey));

  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(
    <g>
      {markups
        .filter((markup) => markup.kind !== "ICON")
        .map((markup) => (
          <MarkupShape key={markup.id} markup={markup} />
        ))}
      {markups.map((markup) => (
        <MeasureLabel key={`label-${markup.id}`} markup={markup} metresPerUnit={scale?.metresPerUnit ?? null} fontSize={LABEL_SIZE} />
      ))}
      {markups
        .filter((markup) => markup.kind === "ICON" && markup.iconKey)
        .map((markup) => {
          const icon = lookup.icon(markup.iconKey!);
          const trade = lookup.trade(markup.iconKey!);
          if (!icon || !trade) return null;
          return <PlacedIcon key={markup.id} point={markup.points[0]!} size={markup.size} icon={icon} trade={trade} number={numbered.has(markup.iconKey!) ? (markup.iconNumber ?? 1) : null} />;
        })}
    </g>,
  );
}
