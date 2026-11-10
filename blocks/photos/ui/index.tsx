// Photos pages and the panel it puts on job pages.
//   /b/photos/capture            the centre button's "Take a photo"
//   /b/photos/report/<job>       printable before/after report
//   panel "job.area"             Photos & notes on a job page

import { can, notFound } from "@grid/core";
import { db, getStorageSettings } from "@grid/db";
import { type BlockPages, type BlockPanels } from "@grid/ui";
import { getProject, myActiveJobs, onSiteNow, type JobAreaPanelProps } from "@grid/block-projects";
import { feed, listDeleted, type PhotoItem } from "../service";
import { DeletedList, type DeletedRowJson } from "./DeletedList";
import { Capture } from "./Capture";
import { JobFeed, type Feed } from "./JobFeed";
import { Report } from "./Report";

/** Dates → strings, the way they reach a client component anyway. */
const json = <T,>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

export const pages: BlockPages = {
  capture: async ({ ctx }) => {
    const [now, jobs] = await Promise.all([onSiteNow(ctx), myActiveJobs(ctx, 30)]);
    const jobId = now?.job?.id ?? jobs[0]?.id;
    if (!jobId) return <Capture job={null} areas={[]} lastArea={null} jobs={[]} />;
    const job = await getProject(ctx, jobId);
    const options = jobs.map((job) => ({ id: job.id, name: job.name, meta: job.siteName }));
    if (!options.some((option) => option.id === job.id)) options.unshift({ id: job.id, name: job.name, meta: job.siteName });
    return <Capture job={{ id: job.id, name: job.name, meta: job.siteName }} areas={job.areas} lastArea={job.lastArea} jobs={options} />;
  },

  report: async ({ ctx, params: [jobId] }) => {
    if (!jobId) throw notFound();
    const job = await getProject(ctx, jobId);
    const { items } = await feed(ctx, jobId);
    const company = ctx.companyId ? await db.company.findUnique({ where: { id: ctx.companyId }, select: { name: true } }) : null;
    return (
      <Report
        job={{ id: job.id, name: job.name, jobNumber: job.jobNumber, clientName: job.clientName, address: job.site.address, company: company?.name ?? "" }}
        areas={job.areas}
        photos={items.filter((item): item is PhotoItem => item.kind === "photo")}
      />
    );
  },
};

export const panels: BlockPanels = {
  // Settings › Storage: Recently deleted photos and notes (managers).
  "storage.deleted": async ({ ctx }) => {
    if (!can(ctx, "photos.manage")) return null;
    const [rows, settings] = await Promise.all([listDeleted(ctx), getStorageSettings()]);
    return <DeletedList initial={json<DeletedRowJson[]>(rows)} days={settings.deletedDays} />;
  },

  "job.area": async (props) => {
    const { ctx, job, area, areas } = props as typeof props & JobAreaPanelProps;
    if (!can(ctx, "photos.view")) return null;
    const initial = await feed(ctx, job.id, area ? { buildingId: area.buildingId, levelId: area.levelId } : {});
    return (
      <JobFeed
        job={job}
        areas={areas}
        area={area}
        initial={json<Feed>(initial)}
        canAdd={can(ctx, "photos.add")}
        canManage={can(ctx, "photos.manage")}
        userId={ctx.userId}
      />
    );
  },
};
