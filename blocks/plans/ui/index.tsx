// Plans pages and the panel on job pages.
//   /b/plans/job/<projectId>            the job's sheets, upload
//   /b/plans/sheet/<sheetId>[/<versionId>]  the viewer (current revision unless one is given)
//   slot "plans.viewer"                 other Blocks draw on the sheet (markups, photo pins)
//   panel "job.area"                    "Plans · 24 sheets", and the sheets for the level you're on

import { FileStack } from "lucide-react";
import { can } from "@grid/core";
import type { BlockPages, BlockPanels, PlanViewerPanelProps } from "@grid/ui";
import { getProject, type JobAreaPanelProps } from "@grid/block-projects";
import { getSheet, listSheets, sheetsForArea } from "../service";
import { PlansList, type SheetRowJson } from "./PlansList";
import { Viewer, type SheetJson } from "./Viewer";

const json = <T,>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

export const pages: BlockPages = {
  job: async ({ ctx, params: [projectId] }) => {
    const job = await getProject(ctx, projectId ?? "");
    const rows = await listSheets(ctx, job.id);
    return <PlansList projectId={job.id} jobName={job.name} initial={json<SheetRowJson[]>(rows)} canUpload={can(ctx, "plans.upload")} />;
  },
  sheet: async ({ ctx, params: [sheetId, versionId], panels }) => {
    const sheet = await getSheet(ctx, sheetId ?? "");
    const job = await getProject(ctx, sheet.projectId);
    const areas = job.areas.map((area) => ({
      buildingId: area.buildingId,
      levelId: area.levelId,
      label: area.levelId ? (job.site.buildings.length > 1 ? `${area.buildingName} · ${area.levelName}` : area.levelName!) : area.buildingName,
    }));
    // Markups, photo pins… drawn over the sheet by other Blocks.
    const overlayProps: PlanViewerPanelProps = {
      sheet: { id: sheet.id, projectId: sheet.projectId, number: sheet.number, buildingId: sheet.buildingId, levelId: sheet.levelId },
      jobName: job.name,
    };
    const overlays = await panels("plans.viewer", { ...overlayProps });
    return (
      <Viewer
        overlays={overlays}
        sheet={json<SheetJson>(sheet)}
        versionId={versionId && sheet.versions.some((version) => version.id === versionId) ? versionId : null}
        jobName={job.name}
        areas={areas}
        permissions={{ manage: can(ctx, "plans.manage"), upload: can(ctx, "plans.upload") }}
      />
    );
  },
};

export const panels: BlockPanels = {
  "job.area": async (props) => {
    const { ctx, job, area } = props as typeof props & JobAreaPanelProps;
    if (!can(ctx, "plans.view")) return null;
    const { total, here, recent } = await sheetsForArea(ctx, job.id, area);
    if (!total && !can(ctx, "plans.upload")) return null;
    const list = here.length ? here : recent;
    return (
      <section className="rounded-xl border bg-card" aria-label="Plans">
        <a href={`/b/plans/job/${job.id}`} className="flex min-h-touch-lg items-center gap-3 px-4 py-3 hover:bg-muted">
          <FileStack className="size-5 text-primary" />
          <span className="flex-1 font-semibold">Plans</span>
          <span className="text-sm text-muted-foreground">{total ? `${total} sheet${total === 1 ? "" : "s"}` : "Upload plans"}</span>
        </a>
        {list.length > 0 && (
          <ul className="divide-y border-t">
            {list.slice(0, 5).map((item) => (
              <li key={item.id}>
                <a href={`/b/plans/sheet/${item.id}`} className="flex min-h-touch items-center gap-3 px-4 py-2 hover:bg-muted">
                  <span className="w-20 shrink-0 truncate font-semibold">{item.number}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{item.title || item.disciplineName}</span>
                  {item.current?.revision && <span className="shrink-0 text-xs text-muted-foreground">Rev {item.current.revision}</span>}
                </a>
              </li>
            ))}
          </ul>
        )}
        {here.length > 0 && <p className="border-t px-4 py-2 text-xs text-muted-foreground">Sheets for this level</p>}
      </section>
    );
  },
};
