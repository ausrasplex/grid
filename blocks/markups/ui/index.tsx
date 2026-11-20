// Markups pages and panels.
//   /markups/icons        Settings › Icons: the business's own icons (phase 4c part 3)
//   slot "plans.viewer"   the markup layer and tools over a plan sheet, and
//                         the trade icon layer (library, placing, counts; phase 4c)
//   slot "quote.takeoff"  a quote's Take-off section: icon counts into quote lines (phase 4c)

import { can } from "@grid/core";
import { Alert, type BlockPages, type BlockPanels, type PlanViewerPanelProps, type QuoteTakeoffPanelProps } from "@grid/ui";
import { customIcons, groupColours } from "../custom-icons";
import { jobIcons } from "../icon-versions";
import { sheetMarkups } from "../service";
import { CustomIcons } from "./CustomIcons";
import { IconLayer, type JobIconsJson, type PlacedIconJson } from "./IconLayer";
import { MarkupLayer, type MarkupJson, type ScaleJson } from "./MarkupLayer";
import { QuoteTakeoff } from "./QuoteTakeoff";

const json = <T,>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

export const pages: BlockPages = {
  icons: async ({ ctx }) => {
    if (!can(ctx, "markups.view")) return <Alert variant="error">You don&apos;t have permission to see icons.</Alert>;
    const [icons, colours] = await Promise.all([customIcons(ctx), groupColours(ctx)]);
    return <CustomIcons initial={icons} initialColours={colours} canManage={can(ctx, "markups.manage")} />;
  },
};

export const panels: BlockPanels = {
  "plans.viewer": async (props) => {
    const { ctx, sheet } = props as typeof props & PlanViewerPanelProps;
    if (!can(ctx, "markups.view")) return null;
    const [initial, job, custom, colours] = await Promise.all([sheetMarkups(ctx, sheet.id), jobIcons(ctx, sheet.projectId), customIcons(ctx), groupColours(ctx)]);
    const icons: PlacedIconJson[] = initial.markups
      .filter((markup) => markup.kind === "ICON" && markup.iconKey)
      .map((markup) => ({ id: markup.id, versionId: markup.versionId, points: markup.points, size: markup.size, iconKey: markup.iconKey!, iconNumber: markup.iconNumber, layerId: markup.layerId, canChange: markup.canChange }));
    const drawings = { ...initial, markups: initial.markups.filter((markup) => markup.kind !== "ICON") };
    return (
      <>
        <MarkupLayer sheetId={sheet.id} initial={json<{ markups: MarkupJson[]; scales: ScaleJson[] }>(drawings)} canAdd={can(ctx, "markups.add")} solo={ctx.solo} />
        <IconLayer
          sheetId={sheet.id}
          projectId={sheet.projectId}
          levelId={sheet.levelId}
          initialIcons={icons}
          initialJob={json<JobIconsJson>(job)}
          canAdd={can(ctx, "markups.add")}
          customIcons={custom}
          groupColours={colours}
          canManageIcons={can(ctx, "markups.manage")}
          documentsOn={ctx.enabledBlocks.has("documents") && can(ctx, "documents.view")}
        />
      </>
    );
  },

  "quote.takeoff": async (props) => {
    const { ctx, quote } = props as typeof props & QuoteTakeoffPanelProps;
    if (!can(ctx, "markups.view")) return null;
    // The job gone, or not this business's to see: no take-off to show.
    const job = quote.projectId ? await jobIcons(ctx, quote.projectId).catch(() => null) : null;
    if (quote.projectId && !job) return null;
    const [custom, colours] = await Promise.all([customIcons(ctx), groupColours(ctx)]);
    return <QuoteTakeoff initial={job ? json<JobIconsJson>(job) : null} canEditIcons={can(ctx, "markups.add")} customIcons={custom} groupColours={colours} />;
  },
};
