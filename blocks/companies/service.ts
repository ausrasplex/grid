// Public service API of the companies block.
//
// Every function that changes data takes the RequestContext and only
// ever touches ctx.companyId (the user's active company), so one company
// can never read or change another's members, roles or blocks.

import {
  app,
  badRequest,
  conflict,
  forbidden,
  notFound,
  requireCompany,
  SYSTEM_ROLES,
  type RequestContext,
  type SystemRole,
} from "@grid/core";
import { audit, db, type Prisma, type Tx } from "@grid/db";
import { ensureUser } from "@grid/block-users";
import { TRADE_PRESETS, startingBlocks } from "./presets";
import type { CreateCompanyInput, InviteInput, RoleInput, UpdateCompanyInput } from "./validation";

const MOD = "companies";

const ROLE_NAMES: Record<SystemRole, string> = {
  OWNER: "Owner",
  FOREMAN: "Foreman",
  EMPLOYEE: "Employee",
  VIEWER: "Viewer",
};

async function emit(event: string, payload: unknown, ctx: { companyId: string | null; userId: string | null }) {
  await app().events.emit(event, payload, { emittedBy: MOD, companyId: ctx.companyId, actorId: ctx.userId });
}

/** Stops someone handing out permissions they don't hold themselves. */
function assertNoEscalation(ctx: RequestContext, permissions: string[]) {
  const missing = permissions.filter((permission) => !ctx.permissions.has(permission));
  if (missing.length) throw forbidden(`You can't grant permissions you don't have: ${missing.join(", ")}`);
}

function assertKnownPermissions(permissions: string[]) {
  const known = new Set(app().registry.permissionCatalog().flatMap((catalogEntry) => catalogEntry.permissions.map((permission) => permission.key)));
  const unknown = permissions.filter((permission) => !known.has(permission));
  if (unknown.length) throw badRequest(`Unknown permissions: ${unknown.join(", ")}`);
}

// ---------------------------------------------------------------------
// Access resolution (used by the app to build each RequestContext)
// ---------------------------------------------------------------------

export interface CompanyAccess {
  permissions: Set<string>;
  enabledBlocks: Set<string>;
  roleName: string;
  systemRole: string | null;
  /** One active member and no pending invites (docs/roadmap.md, Phase 1). */
  solo: boolean;
}

/** Solo is worked out from the company, never stored. */
export async function isSolo(companyId: string, tx: Tx = db): Promise<boolean> {
  const [active, invited] = await Promise.all([
    tx.membership.count({ where: { companyId, status: "ACTIVE" } }),
    tx.membership.count({ where: { companyId, status: "INVITED" } }),
  ]);
  return active <= 1 && invited === 0;
}

/** Null when the user isn't an active member of the company. */
export async function resolveAccess(userId: string, companyId: string): Promise<CompanyAccess | null> {
  const membership = await db.membership.findFirst({
    where: { userId, companyId, status: "ACTIVE", company: { deletedAt: null } },
    include: { role: true },
  });
  if (!membership) return null;
  const stored = await db.companyBlock.findMany({ where: { companyId, enabled: true }, select: { blockId: true } });
  const enabledBlocks = app().registry.effectiveEnabled(stored.map((storedBlock) => storedBlock.blockId));
  // A role keeps permissions for switched-off blocks (so switching back on
  // restores them), but they don't apply while the block is off.
  const permissions = new Set(membership.role.permissions.filter((permission) => enabledBlocks.has(permission.split(".")[0]!)));
  const solo = await isSolo(companyId);
  return { permissions, enabledBlocks, roleName: membership.role.name, systemRole: membership.role.systemRole, solo };
}

// ---------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------

/**
 * Creates a company with built-in roles, makes the creator its Owner and
 * switches on its starting Blocks (trade preset adjusted for "Just me" or
 * "With a team"). Both sizes create the same records.
 */
export async function createCompany(userId: string, input: CreateCompanyInput) {
  const { registry } = app();
  const preset = TRADE_PRESETS[input.tradeProfile];
  const company = await db.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: input.name,
        abn: input.abn ?? null,
        tradeProfile: input.tradeProfile,
        settings: { features: preset.features, units: "metric" },
      },
    });
    let ownerRoleId = "";
    for (const systemRole of SYSTEM_ROLES) {
      const role = await tx.role.create({
        data: { companyId: company.id, name: ROLE_NAMES[systemRole], systemRole, permissions: registry.grantsFor(systemRole) },
      });
      if (systemRole === "OWNER") ownerRoleId = role.id;
    }
    await tx.membership.create({
      data: { userId, companyId: company.id, roleId: ownerRoleId, status: "ACTIVE" },
    });
    const optional = startingBlocks(input.tradeProfile, input.size).filter((id) => {
      const definition = registry.get(id);
      return definition && !definition.required;
    });
    if (optional.length) {
      await tx.companyBlock.createMany({ data: optional.map((blockId) => ({ companyId: company.id, blockId })) });
    }
    await audit(tx, {
      blockId: MOD,
      actorId: userId,
      companyId: company.id,
      entityType: "Company",
      entityId: company.id,
      action: "created",
      diff: { name: input.name, tradeProfile: input.tradeProfile, size: input.size, blocks: optional },
    });
    return company;
  });
  await emit("companies.created", { companyId: company.id }, { companyId: company.id, userId });
  return company;
}

/** Every company the user belongs to or has been invited to (for the company switcher). */
/** The company to act as when none is chosen yet: the user's earliest active membership. */
export async function defaultCompanyId(userId: string): Promise<string | null> {
  const membership = await db.membership.findFirst({
    where: { userId, status: "ACTIVE", company: { deletedAt: null } },
    orderBy: { createdAt: "asc" },
    select: { companyId: true },
  });
  return membership?.companyId ?? null;
}

/** Whether the user has any company at all, or a pending invite to one. */
export async function hasAnyMembership(userId: string): Promise<boolean> {
  return (await db.membership.count({ where: { userId, status: { in: ["ACTIVE", "INVITED"] }, company: { deletedAt: null } } })) > 0;
}

export async function listMyCompanies(userId: string) {
  const rows = await db.membership.findMany({
    where: { userId, status: { in: ["ACTIVE", "INVITED"] }, company: { deletedAt: null } },
    include: { company: { select: { id: true, name: true, tradeProfile: true, logoKey: true } }, role: { select: { name: true } } },
    orderBy: { company: { name: "asc" } },
  });
  return rows.map((row) => ({ membershipId: row.id, status: row.status, role: row.role.name, company: row.company }));
}

export async function getCurrentCompany(ctx: RequestContext) {
  const company = await db.company.findFirst({ where: { id: requireCompany(ctx), deletedAt: null } });
  if (!company) throw notFound("Company not found");
  return company;
}

export async function updateCurrentCompany(ctx: RequestContext, input: UpdateCompanyInput) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const company = await tx.company.update({
      where: { id: companyId },
      data: {
        name: input.name,
        abn: input.abn,
        tradeProfile: input.tradeProfile,
        settings: input.settings as Prisma.InputJsonValue | undefined,
      },
    });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      entityType: "Company",
      entityId: companyId,
      action: "updated",
      diff: input as Prisma.InputJsonValue,
    });
    return company;
  });
}

// ---------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------

export async function listMembers(ctx: RequestContext) {
  const rows = await db.membership.findMany({
    where: { companyId: requireCompany(ctx), status: { in: ["ACTIVE", "INVITED"] } },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      role: { select: { id: true, name: true, systemRole: true } },
    },
    orderBy: { user: { name: "asc" } },
  });
  return rows.map((row) => ({ membershipId: row.id, status: row.status, user: row.user, role: row.role, since: row.createdAt }));
}

async function companyRole(tx: Tx, companyId: string, roleId: string) {
  const role = await tx.role.findFirst({ where: { id: roleId, companyId } });
  if (!role) throw badRequest("That role doesn't belong to this company");
  return role;
}

async function companyMembership(tx: Tx, companyId: string, membershipId: string) {
  const membership = await tx.membership.findFirst({
    where: { id: membershipId, companyId, status: { not: "REMOVED" } },
    include: { role: true },
  });
  if (!membership) throw notFound("Member not found");
  return membership;
}

/** Throws if the change would leave the company without an active Owner. */
async function assertKeepsAnOwner(tx: Tx, companyId: string, losingMembershipId: string) {
  const owners = await tx.membership.count({
    where: { companyId, status: "ACTIVE", role: { systemRole: "OWNER" }, id: { not: losingMembershipId } },
  });
  if (owners === 0) throw conflict("A company needs at least one Owner. Make someone else an Owner first.");
}

export async function inviteMember(ctx: RequestContext, input: InviteInput) {
  const companyId = requireCompany(ctx);
  const result = await db.$transaction(async (tx) => {
    const role = await companyRole(tx, companyId, input.roleId);
    assertNoEscalation(ctx, role.permissions);
    const { user } = await ensureUser({ email: input.email, name: input.name }, ctx.userId, tx);

    const existing = await tx.membership.findUnique({ where: { userId_companyId: { userId: user.id, companyId } } });
    if (existing && existing.status !== "REMOVED") {
      throw conflict(existing.status === "ACTIVE" ? "Already a member" : "Already invited");
    }
    const membership = existing
      ? await tx.membership.update({
          where: { id: existing.id },
          data: { status: "INVITED", roleId: role.id, invitedBy: ctx.userId },
        })
      : await tx.membership.create({
          data: { userId: user.id, companyId, roleId: role.id, status: "INVITED", invitedBy: ctx.userId },
        });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      entityType: "Membership",
      entityId: membership.id,
      action: "invited",
      diff: { email: user.email, role: role.name },
    });
    return { membershipId: membership.id, userId: user.id, email: user.email, role: role.name };
  });
  // Stage 6 (notifications/email) listens to this to send the invite email.
  await emit("companies.member.invited", { companyId, ...result, invitedBy: ctx.userId }, ctx);
  return result;
}

/** The invited user accepts. Works before they've picked a company. */
export async function respondToInvite(userId: string, membershipId: string, accept: boolean) {
  const updated = await db.$transaction(async (tx) => {
    const membership = await tx.membership.findFirst({ where: { id: membershipId, userId, status: "INVITED" } });
    if (!membership) throw notFound("Invite not found");
    const updated = await tx.membership.update({
      where: { id: membership.id },
      data: { status: accept ? "ACTIVE" : "REMOVED" },
    });
    await audit(tx, {
      blockId: MOD,
      actorId: userId,
      companyId: membership.companyId,
      entityType: "Membership",
      entityId: membership.id,
      action: accept ? "invite_accepted" : "invite_declined",
    });
    return updated;
  });
  if (accept) {
    await emit("companies.member.joined", { companyId: updated.companyId, userId, membershipId }, { companyId: updated.companyId, userId });
  }
  return { membershipId, status: updated.status, companyId: updated.companyId };
}

export async function changeMemberRole(ctx: RequestContext, membershipId: string, roleId: string) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const membership = await companyMembership(tx, companyId, membershipId);
    const role = await companyRole(tx, companyId, roleId);
    assertNoEscalation(ctx, role.permissions);
    if (membership.role.systemRole === "OWNER" && role.systemRole !== "OWNER") {
      await assertKeepsAnOwner(tx, companyId, membership.id);
    }
    const updated = await tx.membership.update({ where: { id: membership.id }, data: { roleId: role.id } });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      entityType: "Membership",
      entityId: membership.id,
      action: "role_changed",
      diff: { from: membership.role.name, to: role.name },
    });
    return { membershipId: updated.id, role: role.name };
  });
}

export async function removeMember(ctx: RequestContext, membershipId: string) {
  const companyId = requireCompany(ctx);
  const membership = await db.$transaction(async (tx) => {
    const membership = await companyMembership(tx, companyId, membershipId);
    if (membership.role.systemRole === "OWNER") await assertKeepsAnOwner(tx, companyId, membership.id);
    await tx.membership.update({ where: { id: membership.id }, data: { status: "REMOVED" } });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      entityType: "Membership",
      entityId: membership.id,
      action: "removed",
    });
    return membership;
  });
  // Later blocks (projects, sync) listen to revoke this person's access.
  await emit("companies.member.removed", { companyId, userId: membership.userId, membershipId }, ctx);
  return { membershipId, status: "REMOVED" as const };
}

// ---------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------

export async function listRoles(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  const roles = await db.role.findMany({
    where: { companyId },
    include: { _count: { select: { memberships: { where: { status: { not: "REMOVED" } } } } } },
    orderBy: { createdAt: "asc" },
  });
  return {
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      systemRole: role.systemRole,
      editable: role.systemRole === null,
      permissions: role.permissions,
      members: role._count.memberships,
    })),
    catalog: app().registry.permissionCatalog(),
  };
}

export async function createRole(ctx: RequestContext, input: RoleInput) {
  const companyId = requireCompany(ctx);
  assertKnownPermissions(input.permissions);
  assertNoEscalation(ctx, input.permissions);
  return db.$transaction(async (tx) => {
    if (await tx.role.findFirst({ where: { companyId, name: input.name } })) throw conflict("A role with that name exists");
    const role = await tx.role.create({ data: { companyId, name: input.name, permissions: [...new Set(input.permissions)] } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Role", entityId: role.id, action: "created", diff: input });
    return role;
  });
}

export async function updateRole(ctx: RequestContext, roleId: string, input: RoleInput) {
  const companyId = requireCompany(ctx);
  assertKnownPermissions(input.permissions);
  assertNoEscalation(ctx, input.permissions);
  return db.$transaction(async (tx) => {
    const role = await companyRole(tx, companyId, roleId);
    if (role.systemRole) throw forbidden("Built-in roles follow the blocks' defaults. Create a custom role instead.");
    const clash = await tx.role.findFirst({ where: { companyId, name: input.name, id: { not: role.id } } });
    if (clash) throw conflict("A role with that name exists");
    const updated = await tx.role.update({
      where: { id: role.id },
      data: { name: input.name, permissions: [...new Set(input.permissions)] },
    });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      entityType: "Role",
      entityId: role.id,
      action: "updated",
      diff: { before: { name: role.name, permissions: role.permissions }, after: input },
    });
    return updated;
  });
}

export async function deleteRole(ctx: RequestContext, roleId: string) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const role = await companyRole(tx, companyId, roleId);
    if (role.systemRole) throw forbidden("Built-in roles can't be deleted");
    const inUse = await tx.membership.count({ where: { roleId: role.id, status: { not: "REMOVED" } } });
    if (inUse) throw conflict(`${inUse} member(s) still have this role. Move them to another role first.`);
    // Removed members keep history pointing at this role, so re-point them before deleting.
    const fallback = await tx.role.findFirstOrThrow({ where: { companyId, systemRole: "VIEWER" } });
    await tx.membership.updateMany({ where: { roleId: role.id }, data: { roleId: fallback.id } });
    await tx.role.delete({ where: { id: role.id } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Role", entityId: role.id, action: "deleted", diff: { name: role.name } });
    return { deleted: true };
  });
}

/**
 * Brings every company's built-in roles in line with the blocks' current
 * grants. Runs at server start, so deploying a new block (stage) gives
 * existing Owners/Foremen/etc. its permissions automatically.
 */
export async function syncSystemRoles(): Promise<number> {
  const { registry } = app();
  let changed = 0;
  for (const role of SYSTEM_ROLES) {
    const permissions = registry.grantsFor(role);
    const result = await db.role.updateMany({
      where: { systemRole: role, NOT: { permissions: { equals: permissions } } },
      data: { permissions },
    });
    changed += result.count;
  }
  return changed;
}

// ---------------------------------------------------------------------
// Blocks (per-company on/off)
// ---------------------------------------------------------------------

export async function listCompanyBlocks(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  const { registry } = app();
  const stored = await db.companyBlock.findMany({ where: { companyId } });
  const chosen = new Set(stored.filter((storedBlock) => storedBlock.enabled).map((storedBlock) => storedBlock.blockId));
  const effective = registry.effectiveEnabled(chosen);
  return registry.blocks.map((block) => ({
    id: block.id,
    name: block.name,
    description: block.description ?? "",
    version: block.version,
    required: !!block.required,
    chosen: !!block.required || chosen.has(block.id),
    active: effective.has(block.id),
    dependsOn: block.dependsOn ?? [],
    /** Switched on but inactive because a dependency is off. */
    blockedBy: (block.dependsOn ?? []).filter((dependency) => !effective.has(dependency)),
  }));
}

export async function setCompanyBlock(ctx: RequestContext, blockId: string, enabled: boolean) {
  const companyId = requireCompany(ctx);
  const { registry } = app();
  const definition = registry.get(blockId);
  if (!definition) throw notFound("Unknown block");
  if (definition.required) throw badRequest(`${definition.name} is a core block and is always on`);

  const stored = await db.companyBlock.findMany({ where: { companyId, enabled: true } });
  const effective = registry.effectiveEnabled(stored.map((storedBlock) => storedBlock.blockId));
  if (enabled) {
    const missing = (definition.dependsOn ?? []).filter((dependency) => !effective.has(dependency));
    if (missing.length) {
      const names = missing.map((blockId) => registry.get(blockId)?.name ?? blockId).join(", ");
      throw conflict(`Switch on ${names} first`);
    }
  } else {
    const dependents = registry.dependentsOf(blockId, effective);
    if (dependents.length) {
      const names = dependents.map((dependent) => registry.get(dependent)?.name ?? dependent).join(", ");
      throw conflict(`${names} need${dependents.length === 1 ? "s" : ""} ${definition.name}. Switch ${dependents.length === 1 ? "it" : "them"} off first.`);
    }
  }

  await db.$transaction(async (tx) => {
    await tx.companyBlock.upsert({
      where: { companyId_blockId: { companyId, blockId } },
      create: { companyId, blockId, enabled },
      update: { enabled },
    });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      entityType: "CompanyBlock",
      entityId: blockId,
      action: enabled ? "block_enabled" : "block_disabled",
    });
  });
  await emit("companies.blocks.changed", { companyId, blockId, enabled }, ctx);
  return { blockId, enabled };
}
