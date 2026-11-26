import { can } from "@grid/core";
import type { BlockPanels, PlanViewerPanelProps } from "@grid/ui";
import { getProject, type JobTopPanelProps } from "@grid/block-projects";
import { listItems, sheetIconProgress } from "../service";
import { Checklist } from "./Checklist";
import { IconChecklist } from "./IconChecklist";

export const panels: BlockPanels = {
  // Top of the job page, above the work areas: the list is for the whole job.
  "job.top": async (props) => {
    const { ctx, job } = props as typeof props & JobTopPanelProps;
    // A quote's job isn't work yet: no checklist until it's won.
    if (job.status === "QUOTING" || job.status === "NOT_WON") return null;
    const items = await listItems(ctx, job.id);
    const canManage = can(ctx, "checklists.items.manage");
    // Nothing on it, and nobody here can add: say nothing.
    if (!items.length && !canManage) return null;
    return <Checklist jobId={job.id} initial={items} canTick={can(ctx, "checklists.items.tick")} canManage={canManage} archived={job.archived} />;
  },

  // On a plan sheet: each placed icon's own checklist, in the icon's panel,
  // and the ring around icons showing how far along they are. Needs Markups
  // (which places the icons and opens their panel); without it there's nothing to show.
  "plans.viewer": async (props) => {
    const { ctx, sheet } = props as typeof props & PlanViewerPanelProps;
    if (!ctx.enabledBlocks.has("markups")) return null;
    const [job, progress] = await Promise.all([getProject(ctx, sheet.projectId), sheetIconProgress(ctx, sheet.id)]);
    return <IconChecklist initialProgress={progress} canTick={can(ctx, "checklists.items.tick")} canManage={can(ctx, "checklists.items.manage")} archived={!!job.archivedAt} />;
  },
};
