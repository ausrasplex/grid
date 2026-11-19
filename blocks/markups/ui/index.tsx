// Markups panels.
//   slot "plans.viewer"   the markup layer and tools over a plan sheet, and
//                         the trade icon layer (library, placing, counts; phase 4c)
//   slot "quote.takeoff"  a quote's Take-off section: icon counts into quote lines (phase 4c)

import { can } from "@grid/core";
import type { BlockPanels, PlanViewerPanelProps, QuoteTakeoffPanelProps } from "@grid/ui";
import { jobIcons } from "../icon-versions";
import { sheetMarkups } from "../service";
import { IconLayer, type JobIconsJson, type PlacedIconJson } from "./IconLayer";
import { MarkupLayer, type MarkupJson, type ScaleJson } from "./MarkupLayer";
import { QuoteTakeoff } from "./QuoteTakeoff";

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

  "quote.takeoff": async (props) => {
    const { ctx, quote } = props as typeof props & QuoteTakeoffPanelProps;
    if (!can(ctx, "markups.view")) return null;
    // The job gone, or not this business's to see: no take-off to show.
    const job = quote.projectId ? await jobIcons(ctx, quote.projectId).catch(() => null) : null;
    if (quote.projectId && !job) return null;
    return <QuoteTakeoff initial={job ? json<JobIconsJson>(job) : null} canEditIcons={can(ctx, "markups.add")} />;
  },
};
