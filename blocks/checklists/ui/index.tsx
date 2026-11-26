import { can } from "@grid/core";
import type { BlockPanels } from "@grid/ui";
import type { JobTopPanelProps } from "@grid/block-projects";
import { listItems } from "../service";
import { Checklist } from "./Checklist";

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
};
