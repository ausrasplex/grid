// Clients export and import on the server: the downloads, the preview of
// an import, saving it, and Share our card (docs/quotations-block.md
// "Export and import"). The layout and matching live in transfer.ts.

import { randomUUID } from "node:crypto";
import { badRequest, can, forbidden, requireCompany, type RequestContext } from "@grid/core";
import { audit, db } from "@grid/db";
import { getCurrentCompany, listMembers } from "@grid/block-companies";
import { themeFor } from "@grid/block-templates";
import { clientLabel } from "./people";
import { emitRenamed } from "./service";
import { hasChanges, planImport, readTable, toTable, updateFields, type BusinessCard, type Decision, type ImportPlan, type PersonCard } from "./transfer";

const MOD = "clients";

export type SheetFormat = "xlsx" | "csv";

const businessCardSelect = { id: true, name: true, abn: true, phone: true, email: true, address: true, notes: true } as const;
const personCardSelect = { id: true, businessId: true, name: true, role: true, contactName: true, phone: true, email: true, address: true, abn: true, notes: true } as const;

/** Everyone on the list (not removed ones), as contact cards. */
async function cardsOf(companyId: string): Promise<{ businesses: BusinessCard[]; people: PersonCard[] }> {
  const [businesses, people] = await Promise.all([
    db.clientBusiness.findMany({ where: { companyId, deletedAt: null }, select: businessCardSelect, orderBy: { name: "asc" } }),
    db.client.findMany({ where: { companyId, deletedAt: null }, select: personCardSelect, orderBy: { name: "asc" } }),
  ]);
  return { businesses, people };
}

/** A table as a download: Excel (one sheet) or CSV that Excel opens with the right characters. */
async function sheetResponse(table: string[][], fileName: string, format: SheetFormat): Promise<Response> {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet(table);
  // Wide enough to read without dragging every column.
  sheet["!cols"] = table[0]!.map((_, column) => ({ wch: Math.min(40, Math.max(10, ...table.map((row) => (row[column] ?? "").length))) }));
  let body: Uint8Array<ArrayBuffer>;
  let type: string;
  if (format === "csv") {
    body = new TextEncoder().encode("﻿" + XLSX.utils.sheet_to_csv(sheet));
    type = "text/csv; charset=utf-8";
  } else {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Clients");
    body = new Uint8Array(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer);
    type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  const name = `${fileName}.${format}`;
  return new Response(body, {
    headers: {
      "content-type": type,
      "content-disposition": `attachment; filename="${name.replace(/[^\w .()-]/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, no-store",
    },
  });
}

const fileDate = () => new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" }); // 2026-11-26
const safeName = (name: string) => name.replace(/[^\w .()&-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Business";

/** Settings › Clients › Export: the whole list. */
export async function exportClients(ctx: RequestContext, format: SheetFormat) {
  const companyId = requireCompany(ctx);
  const cards = await cardsOf(companyId);
  await db.$transaction((tx) =>
    audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "ClientList", entityId: companyId, action: "exported", diff: { businesses: cards.businesses.length, people: cards.people.length, format } }),
  );
  return sheetResponse(toTable(cards.businesses, cards.people), `Clients ${fileDate()}`, format);
}

/**
 * Share our card: this business and the team members picked, in the same
 * layout, for another business to import as clients. Names, emails and
 * phones only; Role is left for them (a Grid role isn't a job title).
 */
export async function exportOurCard(ctx: RequestContext, membershipIds: string[], format: SheetFormat) {
  const companyId = requireCompany(ctx);
  if (membershipIds.length && !can(ctx, "companies.members.view")) throw forbidden("You can't see the team");
  const [company, theme, members] = await Promise.all([getCurrentCompany(ctx), themeFor(companyId), membershipIds.length ? listMembers(ctx) : Promise.resolve([])]);
  const wanted = new Set(membershipIds);
  const picked = members.filter((member) => wanted.has(member.membershipId));
  if (picked.length !== wanted.size) throw badRequest("Someone picked isn't in the team");
  const business: BusinessCard = { id: companyId, name: company.name, abn: company.abn, phone: theme.phone, email: theme.email, address: theme.address, notes: null };
  const people: PersonCard[] = picked.map((member) => ({
    id: member.user.id,
    businessId: companyId,
    name: member.user.name,
    role: null,
    contactName: null,
    phone: member.user.phone,
    email: member.user.email,
    address: null,
    abn: null,
    notes: null,
  }));
  await db.$transaction((tx) =>
    audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "ClientList", entityId: companyId, action: "sharedCard", diff: { people: picked.map((member) => member.user.name), format } }),
  );
  return sheetResponse(toTable([business], people), `${safeName(company.name)} business card`, format);
}

/** What the preview needs: the plan, and what this person may do with it. */
export interface ImportPreview extends ImportPlan {
  columnsFound: string[];
  canAdd: boolean;
  canUpdate: boolean;
}

async function planFor(companyId: string, cells: unknown[][]) {
  const { rows, skipped, columnsFound } = readTable(cells);
  if (!columnsFound.length) throw badRequest("Grid couldn't find any columns it knows in that file. The first row needs headings like Business, Name, Phone and Email.");
  return { plan: planImport(rows, await cardsOf(companyId), skipped), columnsFound };
}

/** Import, step 1: what the file would do. Nothing is saved. */
export async function previewImport(ctx: RequestContext, cells: unknown[][]): Promise<ImportPreview> {
  const { plan, columnsFound } = await planFor(requireCompany(ctx), cells);
  return { ...plan, columnsFound, canAdd: can(ctx, "clients.add"), canUpdate: can(ctx, "clients.edit") };
}

export interface ImportDecisions {
  businesses: Record<string, Decision>;
  people: Record<string, Decision>;
}

export interface ImportResult {
  businessesAdded: number;
  businessesUpdated: number;
  peopleAdded: number;
  peopleUpdated: number;
  /** People not added because their new business was skipped. */
  peopleLeftOut: number;
}

/**
 * Import, step 2: save it, all or nothing. The plan is worked out again from
 * the file and the list as they are now; `decisions` (by key) say what to do
 * with each, and anything not mentioned does what was suggested.
 */
export async function applyImport(ctx: RequestContext, cells: unknown[][], decisions: ImportDecisions): Promise<ImportResult> {
  const companyId = requireCompany(ctx);
  const { plan } = await planFor(companyId, cells);
  const decide = (kind: keyof ImportDecisions, key: string, suggested: Decision) => decisions[kind][key] ?? suggested;
  const needAdd = () => {
    if (!can(ctx, "clients.add")) throw forbidden("You can't add clients");
  };
  const needUpdate = () => {
    if (!can(ctx, "clients.edit")) throw forbidden("You can't change clients, so matches can only be skipped");
  };

  const result: ImportResult = { businessesAdded: 0, businessesUpdated: 0, peopleAdded: 0, peopleUpdated: 0, peopleLeftOut: 0 };
  /** Labels before, of people whose label may change ("Sam Lee, Honeywell"). */
  const labelsBefore = new Map<string, string>();

  await db.$transaction(
    async (tx) => {
      const businessIdOf = new Map<string, string>();
      const leftOut = new Set<string>();

      for (const planned of plan.businesses) {
        const decision = decide("businesses", planned.key, planned.suggested);
        if (planned.match && decision === "skip") {
          businessIdOf.set(planned.key, planned.match.id);
          continue;
        }
        if (planned.match && decision === "update") {
          businessIdOf.set(planned.key, planned.match.id);
          if (!hasChanges(planned)) continue;
          needUpdate();
          const changes = updateFields(planned);
          if (changes.name) {
            const people = await tx.client.findMany({ where: { companyId, businessId: planned.match.id }, select: { id: true, name: true } });
            for (const person of people) if (!labelsBefore.has(person.id)) labelsBefore.set(person.id, clientLabel({ name: person.name, business: { name: planned.match.name } }));
          }
          await tx.clientBusiness.update({ where: { id: planned.match.id }, data: changes });
          await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "ClientBusiness", entityId: planned.match.id, action: "updated", diff: { imported: true, before: Object.fromEntries(planned.changes.map((change) => [change.field, change.from])) } });
          result.businessesUpdated++;
          continue;
        }
        if (!planned.match && decision === "skip") {
          leftOut.add(planned.key);
          continue;
        }
        // New, or Add as new.
        needAdd();
        const id = randomUUID();
        await tx.clientBusiness.create({ data: { id, companyId, ...planned.fields } });
        await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "ClientBusiness", entityId: id, action: "created", diff: { imported: true, name: planned.fields.name } });
        businessIdOf.set(planned.key, id);
        result.businessesAdded++;
      }

      for (const planned of plan.people) {
        if (planned.businessKey && leftOut.has(planned.businessKey)) {
          result.peopleLeftOut++;
          continue;
        }
        const decision = decide("people", planned.key, planned.suggested);
        const businessId = planned.businessKey ? (businessIdOf.get(planned.businessKey) ?? null) : null;
        if (planned.match && decision === "skip") continue;
        if (planned.match && decision === "update") {
          // A business in the file puts them there; none keeps where they are.
          const moves = planned.businessKey !== null && businessId !== planned.match.businessId;
          if (!planned.changes.length && !moves) continue;
          needUpdate();
          const before = await tx.client.findUniqueOrThrow({ where: { id: planned.match.id }, select: { name: true, business: { select: { name: true } } } });
          if (!labelsBefore.has(planned.match.id)) labelsBefore.set(planned.match.id, clientLabel(before));
          await tx.client.update({ where: { id: planned.match.id }, data: { ...updateFields(planned), ...(moves ? { businessId } : {}) } });
          await audit(tx, {
            blockId: MOD,
            actorId: ctx.userId,
            companyId,
            entityType: "Client",
            entityId: planned.match.id,
            action: "updated",
            diff: { imported: true, before: { ...Object.fromEntries(planned.changes.map((change) => [change.field, change.from])), ...(moves ? { business: before.business?.name ?? null } : {}) } },
          });
          result.peopleUpdated++;
          continue;
        }
        if (!planned.match && decision === "skip") continue;
        needAdd();
        const id = randomUUID();
        await tx.client.create({ data: { id, companyId, ...planned.fields, businessId } });
        await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Client", entityId: id, action: "created", diff: { imported: true, name: planned.fields.name } });
        result.peopleAdded++;
      }

      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "ClientList", entityId: companyId, action: "imported", diff: { ...result } });
    },
    // A big list takes a while; no row limit, so a generous time limit.
    { timeout: 10 * 60_000, maxWait: 30_000 },
  );

  // Jobs keep a copy of the client's label: tell them about any that changed.
  if (labelsBefore.size) {
    const after = await db.client.findMany({ where: { companyId, id: { in: [...labelsBefore.keys()] } }, select: { id: true, name: true, business: { select: { name: true } } } });
    const changed = after.map((person) => ({ id: person.id, label: clientLabel(person) })).filter((person) => person.label !== labelsBefore.get(person.id));
    if (changed.length) await emitRenamed(ctx, companyId, changed);
  }
  return result;
}
