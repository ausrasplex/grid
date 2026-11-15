// Deleting a business, restoring it, leaving it, and removing it for good
// (docs/roadmap.md "Deleting a business").
//
//   Delete   an Owner (permission companies.business.delete) or the server
//            admin. Company.deletedAt is set: nobody can open it, it leaves
//            everyone's business picker, join and signing links stop.
//   Restore  any Owner of it, or the server admin, until it's removed for good.
//   Removed for good  by the nightly storage clean-up once Recently deleted
//            has run out (Storage settings, "deletedDays"): each Block's
//            purgeCompany hook, then purgeCompanyRecords here, then its files.
//   Leave    anyone but the last Owner.

import { app, conflict, forbidden, notFound, requireCompany, type LevelUsage, type RequestContext } from "@grid/core";
import { audit, db, getStorageSettings, purgeDate } from "@grid/db";

const MOD = "companies";

/** "12 jobs", "240 photos", "4 people": what deleting this business takes with it. */
export async function companyUsage(companyId: string): Promise<{ count: number; words: string }[]> {
  const usage: LevelUsage[] = [];
  for (const block of app().registry.blocks) {
    if (!block.cleanup) continue;
    const hook = await block.cleanup();
    if (hook.companyUsage) usage.push(...(await hook.companyUsage(companyId)));
  }
  const people = await db.membership.count({ where: { companyId, status: "ACTIVE" } });
  usage.push({ count: people, one: "person", many: "people" });
  return usage.filter((entry) => entry.count > 0).map((entry) => ({ count: entry.count, words: `${entry.count} ${entry.count === 1 ? entry.one : entry.many}` }));
}

/** The current business's name and what goes with it, for the Delete box. */
export async function deleteSummary(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  const [company, usage, settings] = await Promise.all([
    db.company.findFirst({ where: { id: companyId, deletedAt: null }, select: { name: true } }),
    companyUsage(companyId),
    getStorageSettings(),
  ]);
  if (!company) throw notFound("Business not found");
  return { name: company.name, usage, days: settings.deletedDays };
}

async function setDeleted(companyId: string, actorId: string, typedName: string | null) {
  const company = await db.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw notFound("Business not found");
  if (typedName !== null && typedName.trim().toLowerCase() !== company.name.trim().toLowerCase()) {
    throw conflict(`Type the business's name, "${company.name}", to delete it.`);
  }
  await db.$transaction(async (tx) => {
    await tx.company.update({ where: { id: companyId }, data: { deletedAt: new Date(), deletedById: actorId } });
    await audit(tx, { blockId: MOD, actorId, companyId, entityType: "Company", entityId: companyId, action: "deleted", diff: { name: company.name } });
  });
  await app().events.emit("companies.deleted", { companyId }, { emittedBy: MOD, companyId, actorId });
  const { deletedDays } = await getStorageSettings();
  return { companyId, removedOn: purgeDate(new Date(), deletedDays) };
}

/** An Owner deletes the business they're in (they type its name to confirm). */
export async function deleteCurrentCompany(ctx: RequestContext, typedName: string) {
  return setDeleted(requireCompany(ctx), ctx.userId, typedName);
}

/** Whether this person may bring a deleted business back: one of its Owners. */
async function isOwnerOf(userId: string, companyId: string) {
  return (await db.membership.count({ where: { userId, companyId, status: "ACTIVE", role: { systemRole: "OWNER" } } })) > 0;
}

async function setRestored(companyId: string, actorId: string) {
  const company = await db.company.findFirst({ where: { id: companyId, deletedAt: { not: null }, purgedAt: null } });
  if (!company) throw notFound("That business can't be restored: it isn't deleted, or it has been removed for good.");
  await db.$transaction(async (tx) => {
    await tx.company.update({ where: { id: companyId }, data: { deletedAt: null, deletedById: null } });
    await audit(tx, { blockId: MOD, actorId, companyId, entityType: "Company", entityId: companyId, action: "restored", diff: { name: company.name } });
  });
  await app().events.emit("companies.restored", { companyId }, { emittedBy: MOD, companyId, actorId });
  return { companyId };
}

/** An Owner brings back a business they deleted (from the business picker). */
export async function restoreMyCompany(userId: string, companyId: string) {
  if (!(await isOwnerOf(userId, companyId))) throw forbidden("Only an Owner of that business can restore it.");
  return setRestored(companyId, userId);
}

/** Deleted businesses this person owns, still restorable (shown in the business picker). */
export async function listMyDeletedCompanies(userId: string) {
  const [rows, { deletedDays }] = await Promise.all([
    db.membership.findMany({
      where: { userId, status: "ACTIVE", role: { systemRole: "OWNER" }, company: { deletedAt: { not: null }, purgedAt: null } },
      include: { company: { select: { id: true, name: true, deletedAt: true } } },
      orderBy: { company: { deletedAt: "desc" } },
    }),
    getStorageSettings(),
  ]);
  return rows.map((row) => ({ id: row.company.id, name: row.company.name, deletedAt: row.company.deletedAt!, removedOn: purgeDate(row.company.deletedAt!, deletedDays) }));
}

/** Leave the current business. The last Owner can't: delete it instead, or make someone else an Owner. */
export async function leaveCurrentCompany(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  const membership = await db.membership.findFirst({ where: { userId: ctx.userId, companyId, status: "ACTIVE" }, include: { role: true } });
  if (!membership) throw notFound("You're not in this business");
  await db.$transaction(async (tx) => {
    if (membership.role.systemRole === "OWNER") {
      const owners = await tx.membership.count({ where: { companyId, status: "ACTIVE", role: { systemRole: "OWNER" }, id: { not: membership.id } } });
      if (!owners) throw conflict("You're the only Owner. Make someone else an Owner first, or delete the business.");
    }
    await tx.membership.update({ where: { id: membership.id }, data: { status: "REMOVED" } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Membership", entityId: membership.id, action: "left" });
  });
  await app().events.emit(
    "companies.member.removed",
    { companyId, userId: ctx.userId, membershipId: membership.id },
    { emittedBy: MOD, companyId, actorId: ctx.userId },
  );
  return { left: true };
}

// ---------------------------------------------------------------------
// Server admin (Settings › Accounts & devices): every business on the server.
// ---------------------------------------------------------------------

export async function listAllCompanies() {
  const [companies, { deletedDays }] = await Promise.all([
    db.company.findMany({
      where: { purgedAt: null },
      select: {
        id: true,
        name: true,
        createdAt: true,
        deletedAt: true,
        memberships: { where: { status: "ACTIVE" }, select: { role: { select: { systemRole: true } }, user: { select: { name: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    getStorageSettings(),
  ]);
  return companies.map((company) => ({
    id: company.id,
    name: company.name,
    createdAt: company.createdAt,
    people: company.memberships.length,
    owners: company.memberships.filter((membership) => membership.role.systemRole === "OWNER").map((membership) => membership.user.name),
    deletedAt: company.deletedAt,
    removedOn: company.deletedAt ? purgeDate(company.deletedAt, deletedDays) : null,
  }));
}

/** The server admin deletes any business (no name to type: they confirm in the dialog). */
export async function adminDeleteCompany(adminId: string, companyId: string) {
  return setDeleted(companyId, adminId, null);
}

export async function adminRestoreCompany(adminId: string, companyId: string) {
  return setRestored(companyId, adminId);
}

// ---------------------------------------------------------------------
// Removed for good (called by the storage clean-up, after every Block's
// purgeCompany hook): this Block's own records. The Company row stays,
// with only its name, so the clean-up history and the server's log still
// read properly.
// ---------------------------------------------------------------------

/** Businesses deleted before `before` and not yet removed for good. */
export async function companiesToPurge(before: Date) {
  return db.company.findMany({ where: { deletedAt: { lt: before }, purgedAt: null }, select: { id: true, name: true, deletedAt: true } });
}

export async function purgeCompanyRecords(companyId: string) {
  await db.$transaction(async (tx) => {
    await tx.membership.deleteMany({ where: { companyId } });
    await tx.role.deleteMany({ where: { companyId } });
    await tx.companyBlock.deleteMany({ where: { companyId } });
    await tx.company.update({ where: { id: companyId }, data: { purgedAt: new Date(), abn: null, logoKey: null, settings: {} } });
  });
}
