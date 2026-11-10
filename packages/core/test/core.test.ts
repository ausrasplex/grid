import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BlockRegistry,
  defineBlock,
  dispatch,
  matchRoute,
  HttpError,
  type RequestContext,
} from "../src/index.ts";

const users = defineBlock({
  id: "users",
  name: "Users",
  version: "1.0.0",
  required: true,
  permissions: [{ key: "users.profile.edit", label: "Edit own profile" }],
  grants: { FOREMAN: ["users.profile.edit"], EMPLOYEE: ["users.profile.edit"], VIEWER: ["users.profile.edit"] },
  menus: [{ id: "users.profile", slot: "settings.user", label: "Profile", href: "/settings/profile" }],
  routes: async () => ({
    "GET /me": { requireCompany: false, handler: async (ctx) => ({ id: ctx.userId }) },
  }),
});

const companies = defineBlock({
  id: "companies",
  name: "Companies",
  version: "1.0.0",
  required: true,
  dependsOn: ["users"],
  permissions: [
    { key: "companies.members.view", label: "View members" },
    { key: "companies.members.invite", label: "Invite members" },
  ],
  grants: { FOREMAN: ["companies.members.view", "companies.members.invite"], EMPLOYEE: ["companies.members.view"] },
  menus: [
    { id: "companies.members", slot: "settings.company", label: "Members", href: "/m", permission: "companies.members.view", order: 20, teamOnly: true },
    { id: "companies.details", slot: "settings.company", label: "Details", soloLabel: "Business details", href: "/d", order: 10 },
    { id: "companies.addTeam", slot: "settings.company", label: "Add a team member", href: "/m", order: 30, soloOnly: true },
  ],
  routes: async () => ({
    "GET /:id/members": { permission: "companies.members.view", handler: async (_c, request) => ({ company: request.params.id }) },
    "POST /:id/invites": { permission: "companies.members.invite", handler: async () => ({ ok: true }) },
  }),
});

const rfis = defineBlock({
  id: "rfis",
  name: "RFIs",
  version: "1.0.0",
  dependsOn: ["companies"],
  permissions: [{ key: "rfis.view", label: "View RFIs" }],
  menus: [{ id: "rfis.tab", slot: "project.tabs", label: "RFIs", href: "/rfis", permission: "rfis.view" }],
  routes: async () => ({ "GET /": { permission: "rfis.view", handler: async () => [] } }),
});

const makeRegistry = () => new BlockRegistry([rfis, companies, users]);

function ctx(over: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: "u1",
    companyId: "c1",
    permissions: new Set(),
    enabledBlocks: new Set(["users", "companies"]),
    solo: false,
    ...over,
  };
}

test("blocks are sorted so dependencies come first", () => {
  assert.deepEqual(makeRegistry().blocks.map((block) => block.id), ["users", "companies", "rfis"]);
});

test("missing dependency is rejected", () => {
  assert.throws(() => new BlockRegistry([rfis, users]), /missing block "companies"/);
});

test("dependency cycles are rejected", () => {
  const blockA = defineBlock({ id: "a", name: "A", version: "1", dependsOn: ["b"] });
  const blockB = defineBlock({ id: "b", name: "B", version: "1", dependsOn: ["a"] });
  assert.throws(() => new BlockRegistry([blockA, blockB]), /cycle/);
});

test("required block can't depend on optional one", () => {
  const bad = defineBlock({ id: "bad", name: "Bad", version: "1", required: true, dependsOn: ["rfis"] });
  assert.throws(() => new BlockRegistry([users, companies, rfis, bad]), /can't depend on optional/);
});

test("permissions must be prefixed with the block id", () => {
  assert.throws(
    () => defineBlock({ id: "x", name: "X", version: "1", permissions: [{ key: "y.do", label: "" }] }),
    /must start with "x."/,
  );
});

test("granting an undeclared permission is rejected", () => {
  assert.throws(
    () => defineBlock({ id: "x", name: "X", version: "1", grants: { EMPLOYEE: ["x.nope"] } }),
    /undeclared permission/,
  );
});

test("menu requiring an unknown permission is rejected", () => {
  const block = defineBlock({
    id: "x",
    name: "X",
    version: "1",
    menus: [{ id: "x.m", slot: "sidebar.main", label: "X", href: "/x", permission: "x.ghost" }],
  });
  assert.throws(() => new BlockRegistry([block]), /undeclared permission "x.ghost"/);
});

test("OWNER gets every permission; other roles get their grants", () => {
  const registry = makeRegistry();
  assert.deepEqual(registry.grantsFor("OWNER").sort(), [
    "companies.members.invite",
    "companies.members.view",
    "rfis.view",
    "users.profile.edit",
  ]);
  assert.deepEqual(registry.grantsFor("EMPLOYEE").sort(), ["companies.members.view", "users.profile.edit"]);
});

test("required blocks are always on; optional ones only when chosen", () => {
  const registry = makeRegistry();
  assert.deepEqual([...registry.effectiveEnabled([])].sort(), ["companies", "users"]);
  assert.deepEqual([...registry.effectiveEnabled(["rfis"])].sort(), ["companies", "rfis", "users"]);
});

test("a block switches off when something it depends on is off", () => {
  const plans = defineBlock({ id: "plans", name: "Plans", version: "1", dependsOn: ["companies"] });
  const markups = defineBlock({ id: "markups", name: "Markups", version: "1", dependsOn: ["plans"] });
  const registry = new BlockRegistry([users, companies, plans, markups]);
  assert.ok(!registry.effectiveEnabled(["markups"]).has("markups"));
  assert.ok(registry.effectiveEnabled(["markups", "plans"]).has("markups"));
  assert.deepEqual(registry.dependentsOf("plans", registry.effectiveEnabled(["markups", "plans"])), ["markups"]);
});

test("menus filter by enabled block and permission, then sort", () => {
  const registry = makeRegistry();
  const noPerms = registry.menusFor("settings.company", ctx());
  assert.deepEqual(noPerms.map((menu) => menu.id), ["companies.details"]);
  const withPerm = registry.menusFor("settings.company", ctx({ permissions: new Set(["companies.members.view"]) }));
  assert.deepEqual(withPerm.map((menu) => menu.id), ["companies.details", "companies.members"]);
  // rfis tab hidden while block is off, even with permission
  assert.equal(registry.menusFor("project.tabs", ctx({ permissions: new Set(["rfis.view"]) })).length, 0);
  assert.equal(
    registry.menusFor("project.tabs", ctx({ permissions: new Set(["rfis.view"]), enabledBlocks: new Set(["users", "companies", "rfis"]) }))
      .length,
    1,
  );
});

test("team-only items hide while solo, solo-only items show, solo labels apply", () => {
  const registry = makeRegistry();
  const permissions = new Set(["companies.members.view"]);
  const team = registry.menusFor("settings.company", ctx({ permissions: permissions }));
  assert.deepEqual(team.map((menu) => [menu.id, menu.label]), [["companies.details", "Details"], ["companies.members", "Members"]]);
  const solo = registry.menusFor("settings.company", ctx({ permissions: permissions, solo: true }));
  assert.deepEqual(solo.map((menu) => [menu.id, menu.label]), [["companies.details", "Business details"], ["companies.addTeam", "Add a team member"]]);
});

test("a menu item can't be both teamOnly and soloOnly", () => {
  assert.throws(() =>
    defineBlock({
      id: "x",
      name: "X",
      version: "1.0.0",
      menus: [{ id: "x.a", slot: "sidebar.main", label: "A", href: "/a", teamOnly: true, soloOnly: true }],
    }),
  );
});

test("route matching extracts params and respects method", () => {
  const routes = {
    "GET /:id/members": { handler: async () => null },
    "POST /:id/members/:memberId": { handler: async () => null },
  };
  assert.deepEqual(matchRoute(routes, "GET", "/abc/members")?.params, { id: "abc" });
  assert.deepEqual(matchRoute(routes, "POST", "/abc/members/m%201")?.params, { id: "abc", memberId: "m 1" });
  assert.equal(matchRoute(routes, "DELETE", "/abc/members"), null);
  assert.equal(matchRoute(routes, "GET", "/abc"), null);
});

async function status(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 200;
  } catch (error) {
    if (error instanceof HttpError) return error.status;
    throw error;
  }
}

test("dispatch enforces permission, company and block enablement", async () => {
  const registry = makeRegistry();
  const base = { query: new URLSearchParams(), body: null };
  // permission missing
  assert.equal(await status(dispatch(registry, { ...base, blockId: "companies", method: "GET", path: "/c1/members", ctx: ctx() })), 403);
  // permission present
  const ok = await dispatch(registry, {
    ...base,
    blockId: "companies",
    method: "GET",
    path: "/c1/members",
    ctx: ctx({ permissions: new Set(["companies.members.view"]) }),
  });
  assert.deepEqual(ok, { company: "c1" });
  // no active company
  assert.equal(
    await status(dispatch(registry, { ...base, blockId: "companies", method: "GET", path: "/c1/members", ctx: ctx({ companyId: null, permissions: new Set(["companies.members.view"]) }) })),
    400,
  );
  // route that doesn't need a company
  assert.deepEqual(await dispatch(registry, { ...base, blockId: "users", method: "GET", path: "/me", ctx: ctx({ companyId: null }) }), { id: "u1" });
  // optional block switched off
  assert.equal(await status(dispatch(registry, { ...base, blockId: "rfis", method: "GET", path: "/", ctx: ctx({ permissions: new Set(["rfis.view"]) }) })), 403);
  // unknown block / route
  assert.equal(await status(dispatch(registry, { ...base, blockId: "nope", method: "GET", path: "/", ctx: ctx() })), 404);
  assert.equal(await status(dispatch(registry, { ...base, blockId: "users", method: "GET", path: "/nope", ctx: ctx() })), 404);
});

test("event bus runs enabled subscribers and isolates failures", async () => {
  const seen: string[] = [];
  const blockA = defineBlock({ id: "a", name: "A", version: "1", on: { "x.happened": () => { seen.push("a"); } } });
  const blockB = defineBlock({ id: "b", name: "B", version: "1", on: { "x.happened": () => { throw new Error("boom"); } } });
  const blockC = defineBlock({ id: "c", name: "C", version: "1", on: { "x.happened": () => { seen.push("c"); } } });
  const registry = new BlockRegistry([blockA, blockB, blockC]);
  const bus = registry.createEventBus((id) => id !== "c");
  const logged: string[] = [];
  // swap logger to keep test output clean
  (bus as unknown as { log: (message: string) => void }).log = (message) => logged.push(message);
  const result = await bus.emit("x.happened", {}, { emittedBy: "test", companyId: "c1", actorId: "u1" });
  assert.deepEqual(seen, ["a"]);
  assert.deepEqual(result, { ran: ["a"], failed: ["b"] });
  assert.equal(logged.length, 1);
});

test("isHttpError recognises errors from another copy of the module", async () => {
  const { isHttpError, notFound } = await import("../src/errors.ts");
  assert.equal(isHttpError(notFound()), true);
  // A look-alike made elsewhere (as a second bundled copy would) still counts, via the shared symbol.
  const copy = Object.assign(new Error("x"), { [Symbol.for("grid.HttpError")]: true, status: 409, code: "conflict" });
  assert.equal(isHttpError(copy), true);
  assert.equal(isHttpError(new Error("plain")), false);
  assert.equal(isHttpError(null), false);
});
