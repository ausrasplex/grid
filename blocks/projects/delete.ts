// Deleting a job (docs/stage-2-projects.md "Deleting a job"). Highly
// destructive, so it has several safeties, all checked here on the server:
//   - only an archived job (finished, then archived, first)
//   - only `projects.delete` (Owners only by default)
//   - only the business running it, and only if no other business is on it
//   - the person types the job's number (or name) and it must match
//   - it goes to Recently deleted first: hidden straight away, but it can
//     be put back until Recently deleted runs out (Storage settings, 30
//     days by default); only then does the nightly clean-up remove it
//     for good, through every Block's `purgeProject` hook
// Every step is written to the activity log.

import "server-only";
import { badRequest, conflict, forbidden, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db, getStorageSettings, type Prisma } from "@grid/db";
import { syncSite } from "./service";

const MOD = "projects";
const DAY = 86_400_000;
const VISIBLE: Prisma.ProjectCompanyWhereInput["status"] = { in: ["ACTIVE", "COMPLETED"] };
const JOB_LABEL = "Job no.";
/** The host's job number, from its references. */
const numberOf = (references: { companyId: string; label: string; value: string }[], companyId: string) =>
  references.find((reference) => reference.companyId === companyId && reference.label === JOB_LABEL)?.value ?? null;

/** What has to be typed: the job number if it has one, otherwise its name. */
export const confirmWord = (project: { jobNumber: string | null; name: string }) => project.jobNumber || project.name;
const tidy = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

export async function deleteProject(ctx: RequestContext, projectId: string, typed: string) {
  const companyId = requireCompany(ctx);
  const removedAt = await db.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, deletedAt: null, companies: { some: { companyId, status: VISIBLE } } },
      include: { companies: { select: { companyId: true, status: true } }, references: true },
    });
    if (!project) throw notFound("Job not found");
    const jobNumber = numberOf(project.references, companyId);
    if (project.hostCompanyId !== companyId) throw forbidden("Only the business running this job can delete it");
    if (!project.archivedAt) throw conflict("Only an archived job can be deleted. Finish it and archive it first.");
    if (project.companies.some((link) => link.companyId !== companyId && link.status !== "REMOVED"))
      throw conflict("Another business is on this job, so it can't be deleted.");
    const word = confirmWord({ jobNumber, name: project.name });
    if (tidy(typed) !== tidy(word)) throw badRequest(`Type ${word} exactly to delete this job`);
    const removedAt = new Date();
    await tx.project.update({ where: { id: projectId }, data: { deletedAt: removedAt } });
    await syncSite(tx, project.siteId, companyId, ctx.userId);
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId, entityType: "Project", entityId: projectId, action: "deleted", diff: { name: project.name, jobNumber } });
    return removedAt;
  });
  const { deletedDays } = await getStorageSettings();
  return { id: projectId, deletedAt: removedAt, goneForGoodAfter: new Date(removedAt.getTime() + deletedDays * DAY) };
}

export interface DeletedJobRow {
  id: string;
  name: string;
  jobNumber: string | null;
  clientName: string | null;
  deletedAt: Date;
  /** When the nightly clean-up removes it for good. */
  goneForGoodAfter: Date;
}

/** This business's deleted jobs that can still be put back (Recently deleted). */
export async function deletedProjects(ctx: RequestContext): Promise<DeletedJobRow[]> {
  const companyId = requireCompany(ctx);
  const { deletedDays } = await getStorageSettings();
  const rows = await db.project.findMany({
    where: { hostCompanyId: companyId, deletedAt: { not: null } },
    select: { id: true, name: true, clientName: true, deletedAt: true, references: true },
    orderBy: { deletedAt: "desc" },
    take: 200,
  });
  return rows.map(({ references, ...row }) => ({
    ...row,
    jobNumber: numberOf(references, companyId),
    deletedAt: row.deletedAt!,
    goneForGoodAfter: new Date(row.deletedAt!.getTime() + deletedDays * DAY),
  }));
}

/** Out of Recently deleted, back to an archived job. */
export async function undeleteProject(ctx: RequestContext, projectId: string) {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    const project = await tx.project.findFirst({ where: { id: projectId, hostCompanyId: companyId, deletedAt: { not: null } } });
    if (!project) throw notFound("That job isn't in Recently deleted any more");
    await tx.project.update({ where: { id: projectId }, data: { deletedAt: null } });
    await syncSite(tx, project.siteId, companyId, ctx.userId);
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId, entityType: "Project", entityId: projectId, action: "restored_from_deleted", diff: { name: project.name } });
  });
  return { id: projectId, deletedAt: null };
}

/** For the nightly clean-up: jobs deleted before `before` (any business). No access check. */
export async function jobsToPurge(before: Date) {
  const rows = await db.project.findMany({
    where: { deletedAt: { lt: before } },
    select: { id: true, name: true, hostCompanyId: true, deletedAt: true, references: true },
    take: 100,
  });
  return rows.map(({ references, ...row }) => ({ ...row, jobNumber: numberOf(references, row.hostCompanyId) }));
}
