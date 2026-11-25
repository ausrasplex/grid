// Handover pages and the card on job pages (docs/materials-block.md §2–§3).
//   /handover/<job>        the job's list, by trade and room; sheet settings; the client's link
//   /handover/<job>/pdf    the landscape PDF, inside Grid
//   /handover/settings     Settings › Handover (title, printed trade names, columns)
//   /h/<token>             the client's link (public; rewrites to /p/handover/h/<token>)
//   panel "job.area"       "Handover · 24 lines" on the job page

import { ClipboardList } from "lucide-react";
import { can, isHttpError, notFound } from "@grid/core";
import type { BlockPages, BlockPanels, PublicPages } from "@grid/ui";
import { getProject, type JobAreaPanelProps } from "@grid/block-projects";
import { getCompanySettings, handoverFor, lineCount } from "../service";
import { bringInSources } from "../bring-in";
import { HandoverList } from "./HandoverList";
import { HandoverSettings } from "./HandoverSettings";
import { SchedulePdf } from "./SchedulePdf";
import { SharedHandover, type SharedHandoverJson } from "./SharedHandover";
import type { CompanySettingsJson, HandoverJson } from "./shared";

/** Dates → strings, the way they reach a client component anyway. */
const json = <T,>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

export const pages: BlockPages = {
  settings: async ({ ctx }) => {
    if (!can(ctx, "handover.settings")) return <p>Only the Owner can change the handover settings.</p>;
    return <HandoverSettings initial={json<CompanySettingsJson>(await getCompanySettings(ctx))} />;
  },
  "": async ({ ctx, params: [projectId, sub] }) => {
    if (!projectId || !can(ctx, "handover.view")) throw notFound("Page not found");
    if (sub === "pdf") {
      const job = await getProject(ctx, projectId);
      return <SchedulePdf projectId={job.id} jobName={job.name} />;
    }
    if (sub) throw notFound("Page not found");
    return (
      <HandoverList
        initial={json<HandoverJson>(await handoverFor(ctx, projectId))}
        canEdit={can(ctx, "handover.edit")}
        canShare={can(ctx, "handover.share")}
        canAddMaterials={can(ctx, "materials.manage")}
        bringIn={await bringInSources(ctx)}
      />
    );
  },
};

/** The client's link, /h/<token>. */
export const publicPages: PublicPages = {
  h: async ({ params: [token] }) => {
    const { openShared } = await import("../share");
    try {
      return <SharedHandover view={json<SharedHandoverJson>(await openShared(token ?? ""))} />;
    } catch (error) {
      if (!isHttpError(error) || error.status !== 404) throw error;
      return (
        <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-2 px-4 py-10">
          <h1 className="text-xl font-bold">This link isn&apos;t working</h1>
          <p className="text-muted-foreground">It may have been turned off or run out. Ask whoever sent it for a new link.</p>
        </main>
      );
    }
  },
};

export const panels: BlockPanels = {
  "job.area": async (props) => {
    const { ctx, job, area, singleArea } = props as typeof props & JobAreaPanelProps;
    // The whole job's list: shown on the job, not on each level.
    if (area && !singleArea) return null;
    if (!can(ctx, "handover.view")) return null;
    const count = await lineCount(ctx, job.id);
    if (!count && !can(ctx, "handover.edit")) return null;
    return (
      <section className="overflow-hidden rounded-xl border bg-card" aria-label="Handover">
        <a href={`/handover/${job.id}`} className="flex min-h-touch-lg items-center gap-3 px-4 py-3 hover:bg-muted">
          <ClipboardList className="size-5 text-primary" />
          <span className="flex-1 font-semibold">Handover</span>
          <span className="text-sm text-muted-foreground">{count ? `${count} line${count === 1 ? "" : "s"}` : "Start the list"}</span>
        </a>
      </section>
    );
  },
};
