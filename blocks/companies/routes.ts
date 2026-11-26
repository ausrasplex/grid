// HTTP routes, mounted at /api/companies. "current" always means the
// user's active company (from the company switcher), never an id in the URL.
import { requireCompany, type Routes } from "@grid/core";
import * as svc from "./service";
import { businessPicture } from "./pictures";
import { z } from "zod";
import { listActivity } from "./activity";
import { deleteCurrentCompany, deleteSummary, leaveCurrentCompany, listMyDeletedCompanies, restoreMyCompany } from "./deletion";
import {
  changeRoleSchema,
  createCompanySchema,
  inviteSchema,
  roleSchema,
  setBlockSchema,
  updateCompanySchema,
} from "./validation";

export const routes: Routes = {
  // --- No active company needed
  "GET /mine": { requireCompany: false, handler: (ctx) => svc.listMyCompanies(ctx.userId) },
  // Deleted businesses you own that can still be restored (the business picker).
  "GET /deleted": { requireCompany: false, handler: (ctx) => listMyDeletedCompanies(ctx.userId) },
  "POST /deleted/:companyId/restore": { requireCompany: false, handler: (ctx, request) => restoreMyCompany(ctx.userId, request.params.companyId!) },
  "POST /": { requireCompany: false, handler: (ctx, request) => svc.createCompany(ctx.userId, createCompanySchema.parse(request.body)) },
  "POST /invites/:membershipId/accept": {
    requireCompany: false,
    handler: (ctx, request) => svc.respondToInvite(ctx.userId, request.params.membershipId!, true),
  },
  "POST /invites/:membershipId/decline": {
    requireCompany: false,
    handler: (ctx, request) => svc.respondToInvite(ctx.userId, request.params.membershipId!, false),
  },

  // --- Active company
  "GET /current": { handler: (ctx) => svc.getCurrentCompany(ctx) },
  // Settings › Business details: the business picture (changed through /api/pictures/company).
  "GET /current/picture": { handler: (ctx) => businessPicture(requireCompany(ctx)) },
  // Settings › Activity: the audit log, a page at a time (?before=<last id>&person=<user id>).
  "GET /current/activity": {
    permission: "companies.activity.view",
    handler: (ctx, request) =>
      listActivity(ctx, { before: request.query.get("before") || undefined, person: request.query.get("person") || undefined }),
  },
  // Deleting the business (docs/roadmap.md "Deleting a business"): what goes with it, then delete (type its name).
  "GET /current/delete": { permission: "companies.business.delete", handler: (ctx) => deleteSummary(ctx) },
  "POST /current/delete": {
    permission: "companies.business.delete",
    handler: (ctx, request) => deleteCurrentCompany(ctx, z.object({ name: z.string().max(200) }).parse(request.body).name),
  },
  // Anyone can leave, except the last Owner.
  "POST /current/leave": { handler: (ctx) => leaveCurrentCompany(ctx) },
  "PATCH /current": {
    permission: "companies.details.edit",
    handler: (ctx, request) => svc.updateCurrentCompany(ctx, updateCompanySchema.parse(request.body)),
  },

  "GET /current/members": { permission: "companies.members.view", handler: (ctx) => svc.listMembers(ctx) },
  // A new join link for an invite (the old one stops working).
  "POST /current/members/:membershipId/link": { permission: "companies.members.invite", handler: (ctx, request) => svc.renewInviteLink(ctx, request.params.membershipId!) },
  "POST /current/members": {
    permission: "companies.members.invite",
    handler: (ctx, request) => svc.inviteMember(ctx, inviteSchema.parse(request.body)),
  },
  "PATCH /current/members/:membershipId": {
    permission: "companies.members.manage",
    handler: (ctx, request) => svc.changeMemberRole(ctx, request.params.membershipId!, changeRoleSchema.parse(request.body).roleId),
  },
  "DELETE /current/members/:membershipId": {
    permission: "companies.members.manage",
    handler: (ctx, request) => svc.removeMember(ctx, request.params.membershipId!),
  },

  "GET /current/roles": { permission: "companies.members.view", handler: (ctx) => svc.listRoles(ctx) },
  "POST /current/roles": {
    permission: "companies.roles.manage",
    handler: (ctx, request) => svc.createRole(ctx, roleSchema.parse(request.body)),
  },
  "PUT /current/roles/:roleId": {
    permission: "companies.roles.manage",
    handler: (ctx, request) => svc.updateRole(ctx, request.params.roleId!, roleSchema.parse(request.body)),
  },
  "DELETE /current/roles/:roleId": {
    permission: "companies.roles.manage",
    handler: (ctx, request) => svc.deleteRole(ctx, request.params.roleId!),
  },

  "GET /current/blocks": { permission: "companies.blocks.manage", handler: (ctx) => svc.listCompanyBlocks(ctx) },
  "PUT /current/blocks/:blockId": {
    permission: "companies.blocks.manage",
    handler: (ctx, request) => svc.setCompanyBlock(ctx, request.params.blockId!, setBlockSchema.parse(request.body).enabled),
  },
};
