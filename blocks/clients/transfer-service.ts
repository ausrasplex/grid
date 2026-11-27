// Clients export and import on the server: the downloads, the preview of
// an import, saving it, and Share our card (docs/quotations-block.md
// "Export and import"). The layout and matching live in transfer.ts.

import { randomUUID } from "node:crypto";
import { addressData, badRequest, can, forbidden, notFound, requireCompany, toOptionalAddress, type AddressColumns, type RequestContext } from "@grid/core";
import { audit, db, pictureFolder, readPicture, savePicture } from "@grid/db";
import { getCurrentCompany, listMembers } from "@grid/block-companies";
import { themeFor } from "@grid/block-templates";
import { clientLabel } from "./people";
import { emitRenamed } from "./service";
import { toVCard, vcardFileName, type VCardContact } from "./vcard";
import { addsPicture, hasChanges, planImport, readTable, toTable, updateFields, type BusinessCard, type Decision, type ImportPlan, type PersonCard } from "./transfer";

const MOD = "clients";

export type SheetFormat = "xlsx" | "csv";
/** A zip carries the pictures too (Excel inside). */
export type TransferFormat = SheetFormat | "zip";

/** A file's address is one line: save it in parts (docs/stage-2-projects.md "Addresses"). Left alone when the file doesn't change it. */
function splitAddress<Fields extends { address?: string | null }>(fields: Fields): Omit<Fields, "address"> & Partial<AddressColumns> {
  if (!("address" in fields)) return fields;
  const { address, ...rest } = fields;
  return { ...rest, ...addressData(toOptionalAddress(address ?? null)) };
}

const businessCardSelect = { id: true, name: true, abn: true, phone: true, email: true, address: true, notes: true, logoKey: true } as const;
const personCardSelect = { id: true, businessId: true, name: true, role: true, contactName: true, phone: true, email: true, address: true, abn: true, notes: true, photoKey: true } as const;

/**
 * Everyone on the list (not removed ones), as contact cards. `picture`
 * is the stored picture's key here (any text means "has one", for matching).
 */
async function cardsOf(companyId: string): Promise<{ businesses: BusinessCard[]; people: PersonCard[] }> {
  const [businesses, people] = await Promise.all([
    db.clientBusiness.findMany({ where: { companyId, deletedAt: null }, select: businessCardSelect, orderBy: { name: "asc" } }),
    db.client.findMany({ where: { companyId, deletedAt: null }, select: personCardSelect, orderBy: { name: "asc" } }),
  ]);
  return {
    businesses: businesses.map(({ logoKey, ...business }) => ({ ...business, picture: logoKey })),
    people: people.map(({ photoKey, ...person }) => ({ ...person, picture: photoKey })),
  };
}

/** A table as a file: Excel (one sheet) or CSV that Excel opens with the right characters. */
async function sheetFile(table: string[][], format: SheetFormat): Promise<{ body: Uint8Array<ArrayBuffer>; type: string }> {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet(table);
  // Wide enough to read without dragging every column.
  sheet["!cols"] = table[0]!.map((_, column) => ({ wch: Math.min(40, Math.max(10, ...table.map((row) => (row[column] ?? "").length))) }));
  if (format === "csv") return { body: new TextEncoder().encode("\uFEFF" + XLSX.utils.sheet_to_csv(sheet)), type: "text/csv; charset=utf-8" };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Clients");
  return { body: new Uint8Array(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}

function download(body: Uint8Array<ArrayBuffer>, type: string, name: string) {
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
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "picture";

/**
 * The list as a download. A zip has the spreadsheet (Excel) and a pictures
 * folder, with Business picture and Picture columns naming each row's.
 * `picture` on the cards is the stored key; in the file it becomes a name.
 */
async function listFile(businesses: BusinessCard[], people: PersonCard[], baseName: string, format: SheetFormat | "zip") {
  if (format !== "zip") {
    const sheet = await sheetFile(toTable(businesses, people), format);
    return download(sheet.body, sheet.type, `${baseName}.${format}`);
  }
  const { zipSync } = await import("fflate");
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  /** Adds a stored picture to the zip; returns its name there (or null if it can't be read). */
  const addPicture = async (key: string | null | undefined, name: string) => {
    if (!key) return null;
    let fileName = `pictures/${slug(name)}.jpg`;
    for (let count = 2; used.has(fileName); count++) fileName = `pictures/${slug(name)}-${count}.jpg`;
    try {
      files[fileName] = new Uint8Array(await readPicture(key));
    } catch {
      return null;
    }
    used.add(fileName);
    return fileName;
  };
  const named = {
    businesses: [] as BusinessCard[],
    people: [] as PersonCard[],
  };
  for (const business of businesses) named.businesses.push({ ...business, picture: await addPicture(business.picture, business.name) });
  for (const person of people) named.people.push({ ...person, picture: await addPicture(person.picture, person.name) });
  const sheet = await sheetFile(toTable(named.businesses, named.people, { pictures: true }), "xlsx");
  files[`${baseName}.xlsx`] = sheet.body;
  const zipped = zipSync(files, { level: 6 });
  return download(new Uint8Array(zipped), "application/zip", `${baseName}.zip`);
}

/** Settings › Clients › Export: the whole list (with its pictures, as a zip). */
export async function exportClients(ctx: RequestContext, format: TransferFormat) {
  const companyId = requireCompany(ctx);
  const cards = await cardsOf(companyId);
  await db.$transaction((tx) =>
    audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "ClientList", entityId: companyId, action: "exported", diff: { businesses: cards.businesses.length, people: cards.people.length, format } }),
  );
  return listFile(cards.businesses, cards.people, `Clients ${fileDate()}`, format);
}

/**
 * Share our card: this business and the team members picked, in the same
 * layout, for another business to import as clients. Names, emails and
 * phones only; Role is left for them (a Grid role isn't a job title).
 * Pictures (in a zip): the business picture, and each person's own photo
 * only when they chose "Share my photo on business cards". Everyone else
 * goes without, so the business that imports it shows the business picture.
 */
export async function exportOurCard(ctx: RequestContext, membershipIds: string[], format: TransferFormat) {
  const companyId = requireCompany(ctx);
  if (membershipIds.length && !can(ctx, "companies.members.view")) throw forbidden("You can't see the team");
  const [company, theme, members] = await Promise.all([getCurrentCompany(ctx), themeFor(companyId), membershipIds.length ? listMembers(ctx) : Promise.resolve([])]);
  const wanted = new Set(membershipIds);
  const picked = members.filter((member) => wanted.has(member.membershipId));
  if (picked.length !== wanted.size) throw badRequest("Someone picked isn't in the team");
  const business: BusinessCard = { id: companyId, name: company.name, abn: company.abn, phone: theme.phone, email: theme.email, address: theme.address, notes: null, picture: company.logoKey };
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
    picture: member.user.sharePhotoOnCards ? member.user.ownPhotoKey : null,
  }));
  await db.$transaction((tx) =>
    audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      entityType: "ClientList",
      entityId: companyId,
      action: "sharedCard",
      diff: { people: picked.map((member) => member.user.name), photosShared: picked.filter((member) => member.user.sharePhotoOnCards && member.user.ownPhotoKey).map((member) => member.user.name), format },
    }),
  );
  return listFile([business], people, `${safeName(company.name)} business card`, format);
}

/** What the preview needs: the plan, and what this person may do with it. */
export interface ImportPreview extends ImportPlan {
  columnsFound: string[];
  canAdd: boolean;
  canUpdate: boolean;
}

async function planFor(companyId: string, cells: unknown[][], pictureNames: string[]) {
  const { rows, skipped, columnsFound } = readTable(cells);
  if (!columnsFound.length) throw badRequest("Grid couldn't find any columns it knows in that file. The first row needs headings like Business, Name, Phone and Email.");
  return { plan: planImport(rows, await cardsOf(companyId), skipped, new Set(pictureNames)), columnsFound };
}

/** Import, step 1: what the file would do. Nothing is saved. `pictureNames`: the pictures in a zip. */
export async function previewImport(ctx: RequestContext, cells: unknown[][], pictureNames: string[] = []): Promise<ImportPreview> {
  const { plan, columnsFound } = await planFor(requireCompany(ctx), cells, pictureNames);
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
export async function applyImport(ctx: RequestContext, cells: unknown[][], decisions: ImportDecisions, pictures: Record<string, string> = {}): Promise<ImportResult> {
  const companyId = requireCompany(ctx);
  const { plan } = await planFor(companyId, cells, Object.keys(pictures));
  /**
   * Saves a picture from the zip (base64). A logo is kept whole, a photo
   * fills the circle. One that isn't a picture is left out, not a failure.
   */
  const pictureFrom = async (name: string | null, fit: "cover" | "contain") => {
    const data = name ? pictures[name] : undefined;
    if (!data) return null;
    try {
      return await savePicture(pictureFolder.clients(companyId), Buffer.from(data, "base64"), fit);
    } catch {
      return null;
    }
  };
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
          const changes: Record<string, unknown> = splitAddress(updateFields(planned));
          if (addsPicture(planned)) {
            const logoKey = await pictureFrom(planned.picture, "contain");
            if (logoKey) changes.logoKey = logoKey;
          }
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
        await tx.clientBusiness.create({ data: { id, companyId, ...splitAddress(planned.fields), logoKey: await pictureFrom(planned.picture, "contain") } });
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
          const photoKey = addsPicture(planned) ? await pictureFrom(planned.picture, "cover") : null;
          await tx.client.update({ where: { id: planned.match.id }, data: { ...splitAddress(updateFields(planned)), ...(moves ? { businessId } : {}), ...(photoKey ? { photoKey } : {}) } });
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
        await tx.client.create({ data: { id, companyId, ...splitAddress(planned.fields), businessId, photoKey: await pictureFrom(planned.picture, "cover") } });
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

// ---------------------------------------------------------------------------
// Contact files (.vcf): one person, to send from a phone or save to Contacts
// ---------------------------------------------------------------------------

function vcardResponse(contact: VCardContact) {
  return new Response(toVCard(contact), {
    headers: {
      "content-type": "text/vcard; charset=utf-8",
      "content-disposition": `attachment; filename="${vcardFileName(contact.name).replace(/[^\w .()-]/g, "")}"; filename*=UTF-8''${encodeURIComponent(vcardFileName(contact.name))}`,
      "cache-control": "private, no-store",
    },
  });
}

const pictureBytes = async (key: string | null | undefined) => (key ? new Uint8Array(await readPicture(key).catch(() => Buffer.alloc(0))) : null);

/**
 * Settings › Profile › Share my contact: you, at this business. Your own
 * photo goes in only if you share it on business cards; otherwise the
 * business picture, like Share our business card.
 */
export async function myContact(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  const [company, theme, members] = await Promise.all([getCurrentCompany(ctx), themeFor(companyId), listMembers(ctx)]);
  const me = members.find((member) => member.user.id === ctx.userId);
  if (!me) throw forbidden("You're not in this business");
  const photoKey = me.user.sharePhotoOnCards && me.user.ownPhotoKey ? me.user.ownPhotoKey : company.logoKey;
  return vcardResponse({
    name: me.user.name,
    phone: me.user.phone,
    email: me.user.email,
    business: { name: company.name, phone: theme.phone, email: theme.email, address: theme.address },
    photo: await pictureBytes(photoKey),
  });
}

/** A client's page › Share contact: them, their business, and their photo (else their business's logo). */
export async function clientContact(ctx: RequestContext, clientId: string) {
  const companyId = requireCompany(ctx);
  const client = await db.client.findFirst({
    where: { id: clientId, companyId, deletedAt: null },
    select: { name: true, role: true, phone: true, email: true, address: true, notes: true, photoKey: true, business: { select: { name: true, phone: true, email: true, address: true, logoKey: true } } },
  });
  if (!client) throw notFound("Client not found");
  return vcardResponse({
    name: client.name,
    role: client.role,
    phone: client.phone,
    email: client.email,
    address: client.address,
    notes: client.notes,
    business: client.business,
    photo: await pictureBytes(client.photoKey ?? client.business?.logoKey),
  });
}
