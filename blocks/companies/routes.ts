// HTTP routes, mounted at /api/companies. "current" always means the
// user's active company (from the company switcher), never an id in the URL.
import type { Routes } from "@grid/core";
import * as svc from "./service";
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
  "PATCH /current": {
    permission: "companies.details.edit",
    handler: (ctx, request) => svc.updateCurrentCompany(ctx, updateCompanySchema.parse(request.body)),
  },

  "GET /current/members": { permission: "companies.members.view", handler: (ctx) => svc.listMembers(ctx) },
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
