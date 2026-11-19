// Markups panels.
//   slot "plans.viewer"   the markup layer and tools over a plan sheet, and
//                         the trade icon layer (library, placing, counts; phase 4c)

import { can } from "@grid/core";
import type { BlockPanels, PlanViewerPanelProps } from "@grid/ui";
import { jobIcons } from "../icon-versions";
import { sheetMarkups } from "../service";
import { IconLayer, type JobIconsJson, type PlacedIconJson } from "./IconLayer";
import { MarkupLayer, type MarkupJson, type ScaleJson } from "./MarkupLayer";

const json = <T,>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

export const panels: BlockPanels = {
  "plans.viewer": async (props) => {
    const { ctx, sheet } = props as typeof props & PlanViewerPanelProps;
    if (!can(ctx, "markups.view")) return null;
    const [initial, job] = await Promise.all([sheetMarkups(ctx, sheet.id), jobIcons(ctx, sheet.projectId)]);
    const icons: PlacedIconJson[] = initial.markups
      .filter((markup) => markup.kind === "ICON" && markup.iconKey)
      .map((markup) => ({ id: markup.id, versionId: markup.versionId, points: markup.points, size: markup.size, iconKey: markup.iconKey!, iconNumber: markup.iconNumber, canChange: markup.canChange }));
    const drawings = { ...initial, markups: initial.markups.filter((markup) => markup.kind !== "ICON") };
    return (
      <>
        <MarkupLayer sheetId={sheet.id} initial={json<{ markups: MarkupJson[]; scales: ScaleJson[] }>(drawings)} canAdd={can(ctx, "markups.add")} solo={ctx.solo} />
        <IconLayer sheetId={sheet.id} projectId={sheet.projectId} levelId={sheet.levelId} initialIcons={icons} initialJob={json<JobIconsJson>(job)} canAdd={can(ctx, "markups.add")} />
      </>
    );
  },
};
