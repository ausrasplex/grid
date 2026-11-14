// Markups panels.
//   slot "plans.viewer"   the markup layer and tools over a plan sheet

import { can } from "@grid/core";
import type { BlockPanels, PlanViewerPanelProps } from "@grid/ui";
import { sheetMarkups } from "../service";
import { MarkupLayer, type MarkupJson, type ScaleJson } from "./MarkupLayer";

const json = <T,>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

export const panels: BlockPanels = {
  "plans.viewer": async (props) => {
    const { ctx, sheet } = props as typeof props & PlanViewerPanelProps;
    if (!can(ctx, "markups.view")) return null;
    const initial = await sheetMarkups(ctx, sheet.id);
    return <MarkupLayer sheetId={sheet.id} initial={json<{ markups: MarkupJson[]; scales: ScaleJson[] }>(initial)} canAdd={can(ctx, "markups.add")} solo={ctx.solo} />;
  },
};
