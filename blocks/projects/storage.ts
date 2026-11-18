// Job storage and the Jobs table (phase 2e, docs/stage-2-projects.md
// "Job storage"). Core doesn't know about photos or plans: every Block with
// files for jobs answers through its manifest's `jobStorage` hook.

import "server-only";
import { app, can, requireCompany, type JobStorageLine, type RequestContext } from "@grid/core";
import { db, type Prisma } from "@grid/db";
import { getProject } from "./service";

const JOB_LABEL = "Job no.";
const VISIBLE: Prisma.ProjectCompanyWhereInput["status"] = { in: ["ACTIVE", "COMPLETED"] };

/** Every Block's lines for these jobs (Blocks the business has off too: their files are still on disk). */
async function linesFor(companyId: string, projectIds: string[]): Promise<JobStorageLine[]> {
  if (!projectIds.length) return [];
  const answers = await Promise.all(
    app()
      .registry.blocks.filter((block) => block.jobStorage)
      .map(async (block) => {
        try {
          return await (await block.jobStorage!())(companyId, projectIds);
        } catch (error) {
          // One Block failing shouldn't blank the whole table.
          console.error(`[projects] ${block.id} couldn't report job storage`, error);
          return [];
        }
      }),
  );
  return answers.flat();
}

export interface StorageTotals {
  originalBytes: number;
  copyBytes: number;
  deletedBytes: number;
  unmeasured: number;
}

const totalsOf = (lines: Omit<JobStorageLine, "projectId">[]): StorageTotals => ({
  originalBytes: lines.reduce((total, line) => total + line.originalBytes, 0),
  copyBytes: lines.reduce((total, line) => total + line.copyBytes, 0),
  deletedBytes: lines.reduce((total, line) => total + line.deletedBytes, 0),
  unmeasured: lines.reduce((total, line) => total + line.unmeasured, 0),
});

export interface JobStorage {
  lines: Omit<JobStorageLine, "projectId">[];
  totals: StorageTotals;
}

/** The job page's Storage section (people who finish and reopen jobs). */
export async function jobStorage(ctx: RequestContext, projectId: string): Promise<JobStorage> {
  const companyId = requireCompany(ctx);
  await getProject(ctx, projectId); // 404 unless this business is on the job
  const lines = (await linesFor(companyId, [projectId])).map(({ projectId: _projectId, ...line }) => line);
  return { lines: lines.sort((first, second) => first.label.localeCompare(second.label)), totals: totalsOf(lines) };
}

export interface JobsTableRow {
  id: string;
  name: string;
  jobNumber: string | null;
  clientName: string | null;
  siteId: string;
  siteName: string;
  address: string;
  status: "ACTIVE" | "COMPLETED";
  startedAt: Date;
  completedAt: Date | null;
  /** Count per line key ("photos.photos": 412). */
  counts: Record<string, number>;
  /** Only for people with projects.complete. */
  storage: StorageTotals | null;
}

export interface JobsTable {
  rows: JobsTableRow[];
  /** The count columns, in order: one per kind of thing any job has. */
  columns: { key: string; label: string }[];
  showStorage: boolean;
}

/** Every job of this business with what's on it, for /jobs. */
export async function jobsTable(ctx: RequestContext): Promise<JobsTable> {
  const companyId = requireCompany(ctx);
  const projects = await db.project.findMany({
    where: { deletedAt: null, companies: { some: { companyId, status: VISIBLE } } },
    select: {
      id: true,
      name: true,
      clientName: true,
      status: true,
      startedAt: true,
      completedAt: true,
      siteId: true,
      references: { where: { companyId, label: JOB_LABEL }, select: { value: true }, take: 1 },
    },
    orderBy: { startedAt: "desc" },
  });
  const sites = new Map(
    (await db.site.findMany({ where: { id: { in: [...new Set(projects.map((project) => project.siteId))] } }, select: { id: true, name: true, address: true } })).map((site) => [site.id, site]),
  );
  const lines = await linesFor(companyId, projects.map((project) => project.id));
  const byJob = new Map<string, JobStorageLine[]>();
  const columns = new Map<string, string>();
  for (const line of lines) {
    byJob.set(line.projectId, [...(byJob.get(line.projectId) ?? []), line]);
    columns.set(line.key, line.label);
  }
  const showStorage = can(ctx, "projects.complete");
  return {
    rows: projects.map((project) => {
      const jobLines = byJob.get(project.id) ?? [];
      const site = sites.get(project.siteId);
      return {
        id: project.id,
        name: project.name,
        jobNumber: project.references[0]?.value ?? null,
        clientName: project.clientName,
        siteId: project.siteId,
        siteName: site?.name ?? "",
        address: site?.address ?? "",
        status: project.status,
        startedAt: project.startedAt,
        completedAt: project.completedAt,
        counts: Object.fromEntries(jobLines.map((line) => [line.key, line.count])),
        storage: showStorage ? totalsOf(jobLines) : null,
      };
    }),
    columns: [...columns].map(([key, label]) => ({ key, label })).sort((first, second) => first.label.localeCompare(second.label)),
    showStorage,
  };
}
