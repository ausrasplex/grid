// Public service API of the quotes block (docs/quotations-block.md, phase 3a).
//
// A quote is edited as a draft (Quote + QuoteLine). Sending freezes it into
// a revision (Rev A, B…) with a snapshot and a PDF, so nothing about a sent
// quote changes later. "Edit" on a sent quote reopens it as a draft; the
// next send is the next revision.

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { app, badRequest, conflict, notFound, requireCompany, type RequestContext } from "@grid/core";
import { attachFile, audit, cacheRoot, db, getRenderingSettings, pageDpi, pdfLongestSideInches, readStoredFile, renderPdfPages, saveGeneratedFile, type Prisma, type Tx } from "@grid/db";
import { createProject, createQuotingJob, getProject } from "@grid/block-projects";
import { getSite } from "@grid/block-sites";
import { clientIdsNamed, clientsById, quoteDetails, requireClient, type ClientRow } from "@grid/block-clients";
import { createSignRequest, latestSignRequest, maskEmail, revokeSignRequests } from "@grid/block-signatures";
import { calculate, formatMoney, type LineInput, type Settings as MathSettings, type TaxRate } from "./money";
import { totalsFor, type QuoteSnapshot } from "./snapshot";

export type { QuoteSnapshot } from "./snapshot";
import type {
  BrandInput,
  CreateQuoteInput,
  PriceItemInput,
  SendInput,
  UploadQuoteInput,
  TaxCodeInput,
  TaxSettingsInput,
  UpdateQuoteInput,
  UserSettingsInput,
} from "./validation";

const MOD = "quotes";
const cents = (amount: Prisma.Decimal | number | null | undefined) => (amount == null ? null : Math.round(Number(amount) * 100));
const day = (date: Date) => date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

async function emit(event: string, payload: unknown, ctx: RequestContext) {
  await app().events.emit(event, payload, { emittedBy: MOD, companyId: ctx.companyId, actorId: ctx.userId });
}

// ---------------------------------------------------------------------
// Tax & currency (§3a)
// ---------------------------------------------------------------------

/** The company's tax settings, created with Australian defaults the first time. */
export async function taxSettings(companyId: string, tx: Tx = db) {
  let taxSettings = await tx.taxSettings.findUnique({ where: { companyId } });
  if (!taxSettings) {
    // First use: set up GST 10% and GST-free. Several parts of one page
    // (Home's Quotes tile and "Needs attention") can get here at the same
    // moment, so take a lock for this business and check again inside it:
    // the second one waits, then finds the settings already made.
    const setUp = async (lockTx: Tx) => {
      await lockTx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tax-settings:${companyId}`}))`;
      const existing = await lockTx.taxSettings.findUnique({ where: { companyId } });
      if (existing) return existing;
      let codes = await lockTx.taxCode.findMany({ where: { companyId }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
      if (!codes.length) {
        await lockTx.taxCode.createMany({
          data: [
            { companyId, name: "GST 10%", label: "GST", rate: 0.1, sort: 0 },
            { companyId, name: "GST-free", label: "GST-free", rate: 0, sort: 1 },
          ],
        });
        codes = await lockTx.taxCode.findMany({ where: { companyId }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
      }
      return lockTx.taxSettings.create({ data: { companyId, defaultTaxCodeId: codes[0]?.id ?? null } });
    };
    // Already inside a transaction: lock in it (held until it finishes). Otherwise a short one of our own.
    taxSettings = tx === db ? await db.$transaction((lockTx) => setUp(lockTx)) : await setUp(tx);
  }
  const codes = await tx.taxCode.findMany({ where: { companyId }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
  // Deleted rates stay in the list (marked deleted, never active) so quotes that use them still add up.
  return {
    ...taxSettings,
    codes: codes.map((code) => ({ id: code.id, name: code.name, label: code.label, rate: Number(code.rate), ratePct: Number(code.rate) * 100, active: code.active && !code.deletedAt, deleted: !!code.deletedAt })),
  };
}

export type TaxSettingsView = Awaited<ReturnType<typeof taxSettings>>;

// ---------------------------------------------------------------------
// Settings › You › Quote screen: each person's own, in each business
// ---------------------------------------------------------------------

/** What swiping a quote line does for this person (the defaults until they change it). */
export async function userSettings(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  const row = await db.quoteUserSettings.findUnique({ where: { companyId_userId: { companyId, userId: ctx.userId } } });
  return { swipeLeft: row?.swipeLeft ?? "DELETE", swipeRight: row?.swipeRight ?? "DUPLICATE" };
}

export async function updateUserSettings(ctx: RequestContext, input: UserSettingsInput) {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    await tx.quoteUserSettings.upsert({ where: { companyId_userId: { companyId, userId: ctx.userId } }, create: { companyId, userId: ctx.userId, ...input }, update: input });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "QuoteUserSettings", entityId: ctx.userId, action: "updated", diff: input as Prisma.InputJsonValue });
  });
  return userSettings(ctx);
}

export async function getTaxSettings(ctx: RequestContext) {
  return taxSettings(requireCompany(ctx));
}

export async function updateTaxSettings(ctx: RequestContext, input: TaxSettingsInput) {
  const companyId = requireCompany(ctx);
  await taxSettings(companyId);
  if (input.defaultTaxCodeId && !(await db.taxCode.findFirst({ where: { id: input.defaultTaxCodeId, companyId, deletedAt: null } }))) {
    throw badRequest("Pick one of your tax codes as the default");
  }
  try {
    new Intl.NumberFormat(input.locale, { style: "currency", currency: input.currency });
  } catch {
    throw badRequest("That currency or locale isn't recognised");
  }
  await db.$transaction(async (tx) => {
    await tx.taxSettings.update({ where: { companyId }, data: input });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "TaxSettings", entityId: companyId, action: "updated", diff: input as Prisma.InputJsonValue });
  });
  return taxSettings(companyId);
}

export async function saveTaxCode(ctx: RequestContext, id: string | null, input: TaxCodeInput) {
  const companyId = requireCompany(ctx);
  const data = { name: input.name, label: input.label, rate: input.ratePct / 100, active: input.active };
  if (id) {
    const result = await db.taxCode.updateMany({ where: { id, companyId, deletedAt: null }, data });
    if (!result.count) throw notFound("Tax code not found");
  } else {
    const codeCount = await db.taxCode.count({ where: { companyId } });
    await db.taxCode.create({ data: { companyId, ...data, sort: codeCount } });
  }
  return taxSettings(companyId);
}

/** What uses a tax rate, for the Delete box: price book items, draft quotes, and whether it's the default. */
export async function taxCodeUsage(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const settings = await taxSettings(companyId);
  if (!(await db.taxCode.count({ where: { id, companyId, deletedAt: null } }))) throw notFound("Tax rate not found");
  const [priceItems, draftQuotes] = await Promise.all([
    db.priceItem.count({ where: { companyId, taxCodeId: id, deletedAt: null } }),
    db.quote.count({ where: { companyId, status: "DRAFT", lines: { some: { taxCodeId: id } } } }),
  ]);
  return { priceItems, draftQuotes, isDefault: settings.defaultTaxCodeId === id };
}

/**
 * Deletes a tax rate. Price book items and draft quotes using it move to
 * `moveTo` (another rate, or null for no tax), and so does the default.
 * Sent quotes keep it: their PDFs are frozen, and the rate is only hidden.
 */
export async function deleteTaxCode(ctx: RequestContext, id: string, moveTo: string | null) {
  const companyId = requireCompany(ctx);
  const settings = await taxSettings(companyId);
  if (moveTo === id) throw badRequest("Pick a different rate to move them to");
  return db.$transaction(async (tx) => {
    const code = await tx.taxCode.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!code) throw notFound("Tax rate not found");
    if (moveTo && !(await tx.taxCode.count({ where: { id: moveTo, companyId, deletedAt: null } }))) throw badRequest("Pick one of your tax rates to move them to");
    const items = await tx.priceItem.updateMany({ where: { companyId, taxCodeId: id, deletedAt: null }, data: { taxCodeId: moveTo } });
    const lines = await tx.quoteLine.updateMany({ where: { taxCodeId: id, quote: { companyId, status: "DRAFT" } }, data: { taxCodeId: moveTo } });
    if (settings.defaultTaxCodeId === id) await tx.taxSettings.update({ where: { companyId }, data: { defaultTaxCodeId: moveTo } });
    await tx.taxCode.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      entityType: "TaxCode",
      entityId: id,
      action: "deleted",
      diff: { name: code.name, movedTo: moveTo, priceItems: items.count, draftLines: lines.count },
    });
    return taxSettings(companyId, tx);
  });
}

// ---------------------------------------------------------------------
// Price book
// ---------------------------------------------------------------------

type PriceItemWithBrand = Prisma.PriceItemGetPayload<{ include: { brand: { select: { name: true; deletedAt: true } } } }>;
const withBrand = { brand: { select: { name: true, deletedAt: true } } } as const;

function priceItemView(item: PriceItemWithBrand, showCost: boolean) {
  const brand = item.brand && !item.brand.deletedAt ? item.brand : null;
  return {
    brandId: brand ? item.brandId : null,
    brand: brand?.name ?? null,
    id: item.id,
    kind: item.kind,
    name: item.name,
    unit: item.unit,
    cost: showCost ? (item.cost == null ? null : Number(item.cost)) : null,
    sell: Number(item.sell),
    taxCodeId: item.taxCodeId,
    supplier: item.supplier,
    supplierCode: item.supplierCode,
    favourite: item.favourite,
  };
}

export async function listPriceItems(ctx: RequestContext, options: { q?: string; kind?: "LABOUR" | "MATERIAL"; brand?: string; ids?: string[] } = {}) {
  const companyId = requireCompany(ctx);
  const words = (options.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const rows = await db.priceItem.findMany({
    where: {
      companyId,
      deletedAt: null,
      ...(options.ids ? { id: { in: options.ids } } : {}),
      ...(options.kind ? { kind: options.kind } : {}),
      ...(options.brand === "none"
        ? { OR: [{ brandId: null }, { brand: { deletedAt: { not: null } } }] }
        : options.brand
          ? { brandId: options.brand, brand: { deletedAt: null } }
          : {}),
      AND: words.map((word) => ({
        OR: [
          { name: { contains: word, mode: "insensitive" as const } },
          { supplierCode: { contains: word, mode: "insensitive" as const } },
          { supplier: { contains: word, mode: "insensitive" as const } },
          { brand: { name: { contains: word, mode: "insensitive" as const }, deletedAt: null } },
        ],
      })),
    },
    include: withBrand,
    orderBy: [{ favourite: "desc" }, { name: "asc" }],
    take: 300,
  });
  const showCost = ctx.permissions.has("quotes.costs.view");
  return rows.map((row) => priceItemView(row, showCost));
}

export async function savePriceItem(ctx: RequestContext, id: string | null, input: PriceItemInput) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    // The brand must be one of this business's own.
    if (input.brandId && !(await tx.priceBrand.count({ where: { id: input.brandId, companyId, deletedAt: null } }))) throw notFound("Brand not found");
    let item;
    if (id) {
      const before = await tx.priceItem.findFirst({ where: { id, companyId, deletedAt: null }, select: { cost: true, sell: true } });
      const result = await tx.priceItem.updateMany({ where: { id, companyId, deletedAt: null }, data: input });
      if (!result.count || !before) throw notFound("Price book item not found");
      item = await tx.priceItem.findUniqueOrThrow({ where: { id }, include: withBrand });
      // Price history (docs/quotations-block.md "Supplier price lists"): a cost or sell price changed by hand.
      if (cents(before.cost) !== cents(item.cost) || cents(before.sell) !== cents(item.sell)) {
        await tx.priceChange.create({
          data: { companyId, priceItemId: id, costBefore: before.cost, costAfter: item.cost, sellBefore: before.sell, sellAfter: item.sell, source: "EDIT", changedById: ctx.userId },
        });
      }
    } else {
      item = await tx.priceItem.create({ data: { companyId, ...input }, include: withBrand });
    }
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "PriceItem", entityId: item.id, action: id ? "updated" : "created", diff: input as Prisma.InputJsonValue });
    return priceItemView(item, true);
  });
}

export async function deletePriceItem(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const result = await db.priceItem.updateMany({ where: { id, companyId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (!result.count) throw notFound("Price book item not found");
  return { id, deleted: true };
}

// Brands (Clipsal, HPM…): a list per business that price book items pick from.

/** The business's brands, A–Z, with how many price book items use each. */
export async function listBrands(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  const brands = await db.priceBrand.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true, _count: { select: { items: { where: { deletedAt: null } } } } },
    orderBy: { name: "asc" },
  });
  return brands.map((brand) => ({ id: brand.id, name: brand.name, items: brand._count.items }));
}

export async function saveBrand(ctx: RequestContext, id: string | null, input: BrandInput) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const same = await tx.priceBrand.findFirst({ where: { companyId, deletedAt: null, name: { equals: input.name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
    if (same) throw conflict(`There's already a brand called ${same.name}.`);
    let brand;
    if (id) {
      const result = await tx.priceBrand.updateMany({ where: { id, companyId, deletedAt: null }, data: { name: input.name } });
      if (!result.count) throw notFound("Brand not found");
      brand = await tx.priceBrand.findUniqueOrThrow({ where: { id } });
    } else {
      brand = await tx.priceBrand.create({ data: { companyId, name: input.name } });
    }
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "PriceBrand", entityId: brand.id, action: id ? "updated" : "created", diff: { name: input.name } });
    return { id: brand.id, name: brand.name };
  });
}

/** Removes a brand from the list. Its items stay in the price book, without a brand. */
export async function deleteBrand(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const brand = await tx.priceBrand.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!brand) throw notFound("Brand not found");
    await tx.priceBrand.update({ where: { id }, data: { deletedAt: new Date() } });
    const items = await tx.priceItem.updateMany({ where: { brandId: id, companyId }, data: { brandId: null } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "PriceBrand", entityId: id, action: "deleted", diff: { name: brand.name, items: items.count } });
    return { id, deleted: true };
  });
}

// ---------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------

const quoteInclude = {
  lines: { orderBy: { sort: "asc" } },
  revisions: { orderBy: { sentAt: "asc" }, select: { id: true, label: true, sentAt: true, sentTo: true, pdfFileId: true, sentById: true } },
  events: { orderBy: { at: "desc" }, take: 50 },
} satisfies Prisma.QuoteInclude;

/** A quote with its client (from the clients block; removed clients still show). */
type QuoteRow = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }> & { client: ClientRow | null };

async function ownQuote(tx: Tx, companyId: string, id: string): Promise<QuoteRow> {
  const quote = await tx.quote.findFirst({ where: { id, companyId, deletedAt: null }, include: quoteInclude });
  if (!quote) throw notFound("Quote not found");
  const client = (await clientsById(tx, companyId, [quote.clientId])).get(quote.clientId ?? "") ?? null;
  return { ...quote, client };
}

/** "Q-1001", "Q-1002"… (numbers typed by hand are skipped over). */
async function nextNumber(tx: Tx, companyId: string, prefix: string) {
  const rows = await tx.quote.findMany({ where: { companyId }, select: { number: true } });
  const max = rows.reduce((total, row) => {
    const numberPart = Number(row.number.match(/(\d+)\s*$/)?.[1]);
    return Number.isFinite(numberPart) && numberPart > total ? numberPart : total;
  }, 1000);
  return `${prefix}${max + 1}`;
}

async function event(tx: Tx, quoteId: string, type: string, byUserId: string | null, note?: string | null) {
  await tx.quoteEvent.create({ data: { quoteId, type, byUserId, note: note ?? null } });
}

function linesForMaths(lines: { qty: Prisma.Decimal | number; sell: Prisma.Decimal | number; cost: Prisma.Decimal | number | null; taxCodeId: string | null; optional: boolean; kind: string | null }[]): LineInput[] {
  return lines.map((line) => ({
    qty: Number(line.qty),
    unitCents: cents(line.sell)!,
    unitCostCents: cents(line.cost),
    taxCodeId: line.taxCodeId,
    optional: line.optional,
    material: line.kind === "MATERIAL",
  }));
}

/** The quote's maths settings: its tax mode, the company's rounding and rates, and its materials markup. */
function mathSettings(
  quote: { pricesIncludeTax: boolean; materialsMarkup: boolean; materialsMarkupPct: Prisma.Decimal | null },
  settings: { rounding: string; codes: TaxRate[] },
): MathSettings {
  return {
    pricesIncludeTax: quote.pricesIncludeTax,
    rounding: settings.rounding as "LINE" | "TOTAL",
    codes: settings.codes,
    materialsMarkupPct: quote.materialsMarkup && quote.materialsMarkupPct != null ? Number(quote.materialsMarkupPct) : null,
  };
}

/**
 * What the customer agreed to pay: once accepted with extras chosen, the
 * sent revision's total with those extras (the draft lines may differ).
 */
async function acceptedTotals(quotes: { status: string; currentRevisionId: string | null; acceptedOptions: unknown }[]) {
  const ids = quotes.filter((quote) => quote.status === "ACCEPTED" && quote.currentRevisionId && Array.isArray(quote.acceptedOptions) && quote.acceptedOptions.length).map((quote) => quote.currentRevisionId!);
  if (!ids.length) return new Map<string, number>();
  const revisions = await db.quoteRevision.findMany({ where: { id: { in: ids } }, select: { id: true, snapshot: true } });
  const chosen = new Map(quotes.map((quote) => [quote.currentRevisionId, (quote.acceptedOptions as number[]) ?? []]));
  return new Map(revisions.map((revision) => [revision.id, totalsFor(revision.snapshot as unknown as QuoteSnapshot, chosen.get(revision.id) ?? []).totalCents]));
}

export async function listQuotes(ctx: RequestContext, options: { tab?: "open" | "draft" | "sent" | "won" | "all"; q?: string; clientIds?: string[] } = {}) {
  const companyId = requireCompany(ctx);
  const tab = options.tab ?? "open";
  const status: Prisma.QuoteWhereInput["status"] =
    tab === "draft" ? "DRAFT" : tab === "sent" ? "SENT" : tab === "won" ? "ACCEPTED" : tab === "open" ? { in: ["DRAFT", "SENT"] } : undefined;
  const words = (options.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const clientsNamed = await Promise.all(words.map((word) => clientIdsNamed(companyId, word)));
  const rows = await db.quote.findMany({
    where: {
      companyId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(options.clientIds ? { clientId: { in: options.clientIds } } : {}),
      AND: words.map((word, index) => ({
        OR: [
          { number: { contains: word, mode: "insensitive" as const } },
          { title: { contains: word, mode: "insensitive" as const } },
          { siteAddress: { contains: word, mode: "insensitive" as const } },
          { clientId: { in: clientsNamed[index]! } },
        ],
      })),
    },
    include: { lines: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const settings = await taxSettings(companyId);
  const agreed = await acceptedTotals(rows);
  const clients = await clientsById(db, companyId, rows.map((row) => row.clientId));
  return rows.map((row) => {
    const totals = calculate(linesForMaths(row.lines), mathSettings(row, settings));
    return {
      id: row.id,
      number: row.number,
      title: row.title,
      clientName: clients.get(row.clientId ?? "")?.label ?? null,
      siteAddress: row.siteAddress,
      status: row.status,
      totalCents: row.uploadedTotal != null ? cents(row.uploadedTotal)! : (agreed.get(row.currentRevisionId ?? "") ?? totals.totalCents),
      uploaded: !!row.uploadedFileId,
      validUntil: row.validUntil,
      sentAt: row.sentAt,
      viewedAt: row.viewedAt,
      updatedAt: row.updatedAt,
      revisions: 0,
    };
  });
}

export async function createQuote(ctx: RequestContext, input: CreateQuoteInput) {
  const companyId = requireCompany(ctx);
  const quote = await db.$transaction(async (tx) => {
    const settings = await taxSettings(companyId, tx);
    const client = input.clientId ? await requireClient(tx, companyId, input.clientId) : null;
    // Started from a floor: check the place, and use the site's address unless one was typed.
    const place = input.siteId ? await placeFor(ctx, input.siteId, input.buildingId ?? null, input.levelId ?? null) : null;
    const quote = await tx.quote.create({
      data: {
        companyId,
        number: await nextNumber(tx, companyId, settings.quotePrefix),
        title: input.title,
        clientId: input.clientId ?? null,
        siteAddress: input.siteAddress ?? place?.address ?? client?.address ?? null,
        siteId: place?.siteId ?? null,
        buildingId: place?.buildingId ?? null,
        levelId: place?.levelId ?? null,
        projectId: input.projectId ?? null,
        pricesIncludeTax: settings.pricesIncludeTax,
        validUntil: new Date(Date.now() + settings.validityDays * 86_400_000),
        terms: settings.defaultTerms,
        createdById: ctx.userId,
      },
    });
    await event(tx, quote.id, "CREATED", ctx.userId);
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Quote", entityId: quote.id, action: "created", diff: { number: quote.number, title: input.title } });
    return quote;
  });
  await emit("quotes.created", { quoteId: quote.id }, ctx);
  return { id: quote.id, number: quote.number };
}

/** Everything the editor and quote page need. Costs only with quotes.costs.view. */
export async function getQuote(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const quote = await ownQuote(db, companyId, id);
  const settings = await taxSettings(companyId);
  const showCost = ctx.permissions.has("quotes.costs.view");
  const totals = calculate(linesForMaths(quote.lines), mathSettings(quote, settings));
  const names = new Map(
    (await db.user.findMany({ where: { id: { in: [...quote.events.map((event) => event.byUserId ?? ""), ...quote.revisions.map((revision) => revision.sentById)] } }, select: { id: true, name: true } })).map((user) => [user.id, user.name]),
  );
  return {
    id: quote.id,
    number: quote.number,
    title: quote.title,
    status: quote.status,
    client: quote.client,
    clientId: quote.clientId,
    siteAddress: quote.siteAddress,
    clientView: quote.clientView,
    pricesIncludeTax: quote.pricesIncludeTax,
    validUntil: quote.validUntil,
    intro: quote.intro,
    terms: quote.terms,
    internalNotes: quote.internalNotes,
    projectId: quote.projectId,
    sentAt: quote.sentAt,
    acceptedAt: quote.acceptedAt,
    acceptedHow: quote.acceptedHow,
    acceptedNote: quote.acceptedNote,
    acceptedOptions: (quote.acceptedOptions as number[] | null) ?? [],
    viewedAt: quote.viewedAt,
    link: await latestSignRequest(ctx, MOD, quote.id, "/q/"),
    acceptedTotalCents: (await acceptedTotals([quote])).get(quote.currentRevisionId ?? "") ?? null,
    declinedAt: quote.declinedAt,
    declineReason: quote.declineReason,
    /** On for everyone; the % only with quotes.costs.view. */
    materialsMarkup: quote.materialsMarkup,
    materialsMarkupPct: showCost && quote.materialsMarkupPct != null ? Number(quote.materialsMarkupPct) : null,
    lines: quote.lines.map((line, index) => ({
      id: line.id,
      section: line.section,
      priceItemId: line.priceItemId,
      kind: line.kind,
      description: line.description,
      qty: Number(line.qty),
      unit: line.unit,
      cost: showCost && line.cost != null ? Number(line.cost) : null,
      sell: Number(line.sell),
      /** The price per unit set by the materials markup, when it prices this line (so it shows without the cost). */
      markupSell: totals.lines[index]!.markedUp ? totals.lines[index]!.unitCents / 100 : null,
      taxCodeId: line.taxCodeId,
      optional: line.optional,
      takeoffKey: line.takeoffKey,
    })),
    totals: { ...totals, costCents: showCost ? totals.costCents : 0, margin: showCost ? totals.margin : null },
    revisions: quote.revisions.map((revision) => ({ id: revision.id, label: revision.label, sentAt: revision.sentAt, sentTo: revision.sentTo, hasPdf: !!revision.pdfFileId, sentBy: names.get(revision.sentById) ?? "Someone" })),
    events: quote.events.map((event) => ({ type: event.type, at: event.at, by: event.byUserId ? (names.get(event.byUserId) ?? "Someone") : null, note: event.note })),
    settings: { currency: settings.currency, locale: settings.locale, taxName: settings.taxName, rounding: settings.rounding, defaultTaxCodeId: settings.defaultTaxCodeId, codes: settings.codes, ...(await userSettings(ctx)) },
    canSeeCosts: showCost,
    /** Made outside Grid: its PDF and the total written on it. */
    uploaded: quote.uploadedFileId ? { fileId: quote.uploadedFileId, totalCents: quote.uploadedTotal != null ? cents(quote.uploadedTotal)! : null } : null,
  };
}

export type QuoteView = Awaited<ReturnType<typeof getQuote>>;

/** Saves the draft. Lines are replaced as a whole (the editor sends them all). */
export async function updateQuote(ctx: RequestContext, id: string, input: UpdateQuoteInput) {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    const quote = await ownQuote(tx, companyId, id);
    if (quote.status !== "DRAFT") throw conflict("This quote has been sent. Tap Edit to make a new revision.");
    // A different client must be one on the list (keeping a since-removed one is fine).
    if (input.clientId && input.clientId !== quote.clientId) await requireClient(tx, companyId, input.clientId);
    const showCost = ctx.permissions.has("quotes.costs.view");
    const { lines, materialsMarkup, materialsMarkupPct, ...fields } = input;
    // The materials markup is set by people who can see costs; anyone else's change is ignored.
    const markup = showCost ? { ...(materialsMarkup !== undefined ? { materialsMarkup } : {}), ...(materialsMarkupPct !== undefined ? { materialsMarkupPct } : {}) } : {};
    await tx.quote.update({ where: { id }, data: { ...fields, ...markup } });
    const markupChanged =
      (markup.materialsMarkup !== undefined && markup.materialsMarkup !== quote.materialsMarkup) ||
      (markup.materialsMarkupPct !== undefined && markup.materialsMarkupPct !== (quote.materialsMarkupPct == null ? null : Number(quote.materialsMarkupPct)));
    if (markupChanged) {
      const on = markup.materialsMarkup ?? quote.materialsMarkup;
      const pct = markup.materialsMarkupPct !== undefined ? markup.materialsMarkupPct : quote.materialsMarkupPct == null ? null : Number(quote.materialsMarkupPct);
      await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Quote", entityId: id, action: "materials_markup_changed", diff: { number: quote.number, on, pct } });
    }
    if (lines) {
      // Without permission to see costs, keep the costs that were there, and
      // take a new price book line's cost from its item (the markup needs it).
      const keepCosts = !showCost;
      const oldCost = new Map(quote.lines.map((line) => [line.priceItemId ?? line.description, line.cost]));
      const newItemIds = keepCosts ? lines.flatMap((line) => (line.priceItemId && !oldCost.has(line.priceItemId) ? [line.priceItemId] : [])) : [];
      const itemCost = new Map(
        newItemIds.length ? (await tx.priceItem.findMany({ where: { companyId, id: { in: newItemIds } }, select: { id: true, cost: true } })).map((item) => [item.id, item.cost]) : [],
      );
      await tx.quoteLine.deleteMany({ where: { quoteId: id } });
      if (lines.length) {
        await tx.quoteLine.createMany({
          data: lines.map((line, index) => ({
            quoteId: id,
            sort: index,
            section: line.section ?? null,
            priceItemId: line.priceItemId ?? null,
            kind: line.kind,
            description: line.description,
            qty: line.qty,
            unit: line.unit,
            cost: keepCosts ? (oldCost.get(line.priceItemId ?? line.description) ?? itemCost.get(line.priceItemId ?? "") ?? null) : (line.cost ?? null),
            sell: line.sell,
            taxCodeId: line.taxCodeId,
            optional: line.optional,
            takeoffKey: line.takeoffKey ?? null,
          })),
        });
      }
    }
  });
  return getQuote(ctx, id);
}

// ---------------------------------------------------------------------
// The document: snapshot, PDF, sending
// ---------------------------------------------------------------------

/** Everything the PDF shows, frozen. Changing settings later never changes a sent quote. */
async function buildSnapshot(companyId: string, quoteId: string, userId: string, revision: string | null): Promise<QuoteSnapshot> {
  const quote = await ownQuote(db, companyId, quoteId);
  const settings = await taxSettings(companyId);
  const [company, user] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId }, select: { abn: true } }),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } }),
  ]);
  const totals = calculate(linesForMaths(quote.lines), mathSettings(quote, settings));
  const codeFor = (id: string | null) => settings.codes.find((code) => code.id === id);
  return {
    number: quote.number,
    revision,
    title: quote.title,
    date: day(new Date()),
    validUntil: day(quote.validUntil),
    // A person at a business: their own details, the business's filling the gaps, and its ABN.
    client: quote.client ? quoteDetails(quote.client) : null,
    siteAddress: quote.siteAddress,
    clientView: quote.clientView,
    intro: quote.intro,
    terms: quote.terms,
    lines: quote.lines.map((line, index) => ({
      section: line.section,
      description: line.description,
      qty: Number(line.qty),
      unit: line.unit,
      unitCents: totals.lines[index]!.unitCents,
      amountCents: totals.lines[index]!.amountCents,
      taxLabel: codeFor(line.taxCodeId)?.label ?? "",
      taxRate: codeFor(line.taxCodeId)?.rate ?? 0,
      optional: line.optional,
    })),
    totals: {
      subtotalExCents: totals.subtotalExCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      optionsIncCents: totals.optionsIncCents,
      taxByCode: totals.taxByCode.map((code) => ({ label: code.label, rate: code.rate, taxCents: code.taxCents })),
    },
    tax: {
      taxName: settings.taxName,
      pricesIncludeTax: quote.pricesIncludeTax,
      rounding: settings.rounding as "LINE" | "TOTAL",
      currency: settings.currency,
      locale: settings.locale,
      registrationLabel: settings.registrationLabel,
      registrationNumber: company.abn,
      documentTitle: settings.documentTitle,
    },
    preparedBy: user,
  };
}

/** Renders a snapshot to PDF (the document component is loaded lazily: it pulls in react-dom/server). */
export async function renderQuotePdf(
  companyId: string,
  snapshot: QuoteSnapshot,
  draft: boolean,
  signed?: { accepted: import("./document").Acceptance; certificate: import("@grid/block-signatures").CertificateInfo },
): Promise<Buffer> {
  const [{ themeFor, renderPdf, toHtml }, { QuoteDocument }, { createElement }] = await Promise.all([
    import("@grid/block-templates"),
    import("./document"),
    import("react"),
  ]);
  const theme = await themeFor(companyId);
  return renderPdf(await toHtml(createElement(QuoteDocument, { theme, snapshot, draft, ...signed })), { footer: theme.footerText ?? `${snapshot.tax.documentTitle} ${snapshot.number}` });
}

const pdfResponse = (pdf: Buffer, filename: string, download: boolean) =>
  new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename.replace(/[^\w.\- ]/g, "")}"`,
      "cache-control": "private, no-store",
    },
  });

/** Which PDF of a quote: the signed copy, a sent revision, or (neither) the latest. */
export interface QuotePdfOptions {
  revisionId?: string | null;
  signed?: boolean;
}

/**
 * The PDF bytes: the signed copy, a sent revision's stored copy, an
 * uploaded quote's PDF, or a draft preview marked DRAFT.
 */
async function quotePdfFile(ctx: RequestContext, id: string, options: QuotePdfOptions) {
  const companyId = requireCompany(ctx);
  const quote = await ownQuote(db, companyId, id);
  if (options.signed) {
    const request = quote.signRequestId ? await db.signRequest.findUnique({ where: { id: quote.signRequestId } }) : null;
    if (!request?.signedPdfFileId) throw notFound("This quote wasn't signed online");
    const file = await db.storedFile.findUniqueOrThrow({ where: { id: request.signedPdfFileId } });
    return { pdf: await readStoredFile(file), filename: `${quote.number} signed.pdf`, label: "Signed copy", quote };
  }
  if (quote.uploadedFileId && !options.revisionId) {
    const file = await db.storedFile.findUniqueOrThrow({ where: { id: quote.uploadedFileId } });
    return { pdf: await readStoredFile(file), filename: file.originalName ?? `${quote.number}.pdf`, label: "Uploaded PDF", quote };
  }
  const revision = options.revisionId ? quote.revisions.find((revision) => revision.id === options.revisionId) : quote.status !== "DRAFT" ? quote.revisions.at(-1) : undefined;
  if (options.revisionId && !revision) throw notFound("That revision isn't on this quote");
  if (revision?.pdfFileId) {
    const file = await db.storedFile.findUniqueOrThrow({ where: { id: revision.pdfFileId } });
    return { pdf: await readStoredFile(file), filename: `${quote.number} Rev ${revision.label}.pdf`, label: `Rev ${revision.label}`, quote };
  }
  const snapshot = await buildSnapshot(companyId, id, ctx.userId, null);
  return { pdf: await renderQuotePdf(companyId, snapshot, true), filename: `${quote.number} draft.pdf`, label: "Draft preview", quote };
}

/** The PDF file itself (Download). */
export async function quotePdf(ctx: RequestContext, id: string, options: QuotePdfOptions & { download?: boolean } = {}) {
  const { pdf, filename } = await quotePdfFile(ctx, id, options);
  return pdfResponse(pdf, filename, !!options.download);
}

// ---------------------------------------------------------------------
// The PDF inside Grid: its pages as pictures, so it opens on its own page
// in the app instead of the phone's PDF app or a browser tab. Kept in
// <files>/.cache/quotes/pdf/<quoteId>/<key> (key = the PDF's fingerprint
// and the Quote PDFs level, Settings › Plans & PDFs: a changed draft or a
// changed level gets new pictures, an unchanged one reuses them).
// ---------------------------------------------------------------------

/** How many renders of one quote to keep (older drafts are cleared). */
const PDF_RENDERS_KEPT = 4;
const pdfFolder = (quoteId: string, key?: string) => (key ? cacheRoot("quotes", "pdf", quoteId, key) : cacheRoot("quotes", "pdf", quoteId));

export async function quotePdfPages(ctx: RequestContext, id: string, options: QuotePdfOptions = {}) {
  const { pdf, filename, label, quote } = await quotePdfFile(ctx, id, options);
  const { quotes: level } = await getRenderingSettings();
  const key = createHash("sha256").update(pdf).update(level).digest("hex").slice(0, 24);
  const folder = pdfFolder(id, key);
  let sizes = (await readFile(path.join(folder, "sizes.json"), "utf8").then((text) => JSON.parse(text) as [number, number][]).catch(() => null)) ?? null;
  if (!sizes) {
    const work = await mkdtemp(path.join(tmpdir(), "grid-quote-pdf-"));
    try {
      const file = path.join(work, "quote.pdf");
      await writeFile(file, pdf);
      sizes = await renderPdfPages(file, folder, { dpi: pageDpi(level, await pdfLongestSideInches(file)), timeoutMs: 2 * 60_000 });
      await writeFile(path.join(folder, "sizes.json"), JSON.stringify(sizes));
    } finally {
      await rm(work, { recursive: true, force: true });
    }
    // Keep the newest few renders of this quote; drafts change as they're edited.
    const others = await readdir(pdfFolder(id), { withFileTypes: true }).catch(() => []);
    const dated = await Promise.all(
      others.filter((entry) => entry.isDirectory() && entry.name !== key).map(async (entry) => ({ name: entry.name, at: (await stat(pdfFolder(id, entry.name)).catch(() => null))?.mtimeMs ?? 0 })),
    );
    for (const old of dated.sort((first, second) => second.at - first.at).slice(PDF_RENDERS_KEPT - 1)) await rm(pdfFolder(id, old.name), { recursive: true, force: true });
  }
  return { key, pages: sizes, filename, label, number: quote.number, title: quote.title };
}

/** One page picture ("p2.jpg"). A key's pictures never change, so phones keep them. */
export async function quotePdfPageResponse(ctx: RequestContext, id: string, key: string, name: string) {
  if (!/^[0-9a-f]{24}$/.test(key) || !/^p\d{1,4}\.jpg$/.test(name)) throw notFound();
  await ownQuote(db, requireCompany(ctx), id);
  const full = path.join(pdfFolder(id, key), name);
  try {
    const stats = await stat(/*turbopackIgnore: true*/ full);
    return new Response(Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ full)) as ReadableStream, {
      headers: { "content-type": "image/jpeg", "content-length": String(stats.size), "cache-control": "private, max-age=31536000, immutable" },
    });
  } catch {
    throw notFound();
  }
}

/** End of the quote's last valid day: links work until then. */
function linkExpiry(validUntil: Date) {
  const date = new Date(validUntil);
  date.setHours(23, 59, 59, 999);
  return date;
}

/**
 * Sends the draft: freezes it as the next revision with its PDF, makes
 * the customer's private link (when online acceptance is on and there's
 * an email address to send codes to), then emails it or records that
 * you'll send it yourself.
 */
export async function sendQuote(ctx: RequestContext, id: string, input: SendInput) {
  const companyId = requireCompany(ctx);
  const quote = await ownQuote(db, companyId, id);
  if (quote.uploadedFileId) throw conflict("This quote was made outside Grid. Send its PDF yourself.");
  if (quote.status !== "DRAFT") throw conflict("This quote has already been sent");
  if (!quote.lines.some((line) => !line.optional)) throw badRequest("Add at least one line before sending");
  if (input.how === "email" && !(await app().mail.configured())) {
    throw badRequest("Email isn't set up on this server yet (Settings › Email). Send the PDF yourself and mark it sent.");
  }
  const settings = await taxSettings(companyId);
  // One-time codes go to the address the quote went to (or the client's, if you send it yourself).
  const codeEmail = input.how === "email" ? input.to! : (quote.client?.email ?? null);
  const online = settings.onlineAccept && !!codeEmail && (await app().mail.configured());

  const label = String.fromCharCode(65 + quote.revisions.length); // A, B, C…
  const snapshot = { ...(await buildSnapshot(companyId, id, ctx.userId, label)), acceptOnline: online };
  const pdf = await renderQuotePdf(companyId, snapshot, false);
  const filename = `${quote.number} Rev ${label}.pdf`;

  const { revision, link } = await db.$transaction(async (tx) => {
    const file = await saveGeneratedFile(tx, { companyId, userId: ctx.userId, blockId: MOD, data: pdf, mime: "application/pdf", name: filename, ext: "pdf" });
    const revision = await tx.quoteRevision.create({
      data: { quoteId: id, label, snapshot: snapshot as unknown as Prisma.InputJsonValue, pdfFileId: file.id, sentById: ctx.userId, sentTo: input.how === "email" ? input.to! : null },
    });
    await tx.quote.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), viewedAt: null, currentRevisionId: revision.id } });
    let link: string | null = null;
    if (online) {
      const signRequest = await createSignRequest(tx, {
        companyId,
        blockId: MOD,
        docType: "quotes.acceptance",
        refId: id,
        revisionId: revision.id,
        recipientEmail: codeEmail!,
        docSha256: file.sha256,
        expiresAt: linkExpiry(quote.validUntil),
        createdById: ctx.userId,
      });
      link = signRequest.url("/q/");
    } else {
      await revokeSignRequests(tx, MOD, id, "A newer version was sent");
    }
    await event(tx, id, "SENT", ctx.userId, input.how === "email" ? `Emailed to ${input.to} (Rev ${label})` : `Marked sent (Rev ${label})`);
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Quote", entityId: id, action: "sent", diff: { revision: label, to: input.to ?? null, online } });
    return { revision, link };
  });

  if (input.how === "email") {
    const money = formatMoney(snapshot.totals.totalCents, snapshot.tax.currency, snapshot.tax.locale);
    const greeting = snapshot.client?.contactName || snapshot.client?.name || "there";
    await app().mail.send({
      to: input.to!,
      replyTo: snapshot.preparedBy.email,
      subject: `${snapshot.tax.documentTitle} ${quote.number}: ${quote.title}`,
      text:
        `Hi ${greeting},\n\n` +
        (input.message ? `${input.message}\n\n` : `Please find attached our ${snapshot.tax.documentTitle.toLowerCase()} for ${quote.title}.\n\n`) +
        `Total: ${money} incl. ${snapshot.tax.taxName}\nValid until: ${snapshot.validUntil}\n\n` +
        (link ? `View, accept and sign online:\n${link}\n\n` : "") +
        `Reply to this email with any questions.\n\n${snapshot.preparedBy.name}`,
      attachments: [{ filename, content: new Uint8Array(pdf), contentType: "application/pdf" }],
    });
  }
  await emit("quotes.sent", { quoteId: id, revisionId: revision.id }, ctx);
  return { id, revision: label, link };
}

/** Edit a sent quote: back to draft; the next send is the next revision. */
export async function reopenQuote(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const result = await db.$transaction(async (tx) => {
    const quote = await ownQuote(tx, companyId, id);
    if (quote.uploadedFileId) throw conflict("This quote was made outside Grid. Upload a new PDF instead.");
    if (quote.status !== "SENT" && quote.status !== "DECLINED" && quote.status !== "EXPIRED") throw conflict("Only a sent, declined or expired quote can be revised");
    await tx.quote.update({ where: { id }, data: { status: "DRAFT", declinedAt: null, declineReason: null, viewedAt: null } });
    await revokeSignRequests(tx, MOD, id, "Being revised");
    await event(tx, id, "REOPENED", ctx.userId, `Editing for Rev ${String.fromCharCode(65 + quote.revisions.length)}`);
    return { id, projectId: quote.projectId };
  });
  await emit("quotes.reopened", { quoteId: id, projectId: result.projectId }, ctx);
  return { id };
}

/** A site, building and floor this company can see (the building and floor are dropped if they're gone). */
async function placeFor(ctx: RequestContext, siteId: string, buildingId: string | null, levelId: string | null) {
  const site = await getSite(ctx, siteId);
  const building = buildingId ? site.buildings.find((candidate) => candidate.id === buildingId) : undefined;
  const level = building && levelId ? building.levels.find((candidate) => candidate.id === levelId) : undefined;
  return { siteId: site.id, address: site.address, buildingId: building?.id ?? null, levelId: level?.id ?? null };
}

/**
 * Makes the job an accepted quote turns into: on the site, building and
 * floor it was started from, or else at its site address.
 */
export async function makeJobFromQuote(
  ctx: RequestContext,
  quote: { title: string; number: string; siteAddress: string | null; clientId: string | null; siteId?: string | null; buildingId?: string | null; levelId?: string | null },
  options: { quoting?: boolean } = {},
) {
  const make = options.quoting ? createQuotingJob : createProject;
  if (quote.siteId) {
    const place = await placeFor(ctx, quote.siteId, quote.buildingId ?? null, quote.levelId ?? null).catch(() => null);
    // The floor gone: the job covers the building. The building or site gone: use the address.
    if (place?.buildingId) {
      const companyId = requireCompany(ctx);
      const clientId = quote.clientId ? await requireClient(db, companyId, quote.clientId).then((client) => client.id, () => null) : null;
      const job = await make(ctx, {
        name: quote.title,
        clientId,
        siteId: place.siteId,
        covers: [{ buildingId: place.buildingId, levelId: place.levelId }],
        references: [{ label: "Quote", value: quote.number }],
      });
      return job.id;
    }
  }
  if (!quote.siteAddress) throw badRequest("Add the site address to the quote, so the job knows where it is");
  // The quote's client goes on the job, unless they've since been removed from the list.
  const companyId = requireCompany(ctx);
  const clientId = quote.clientId ? await requireClient(db, companyId, quote.clientId).then((client) => client.id, () => null) : null;
  const job = await make(ctx, {
    name: quote.title,
    clientId,
    address: quote.siteAddress,
    references: [{ label: "Quote", value: quote.number }],
  });
  return job.id;
}

/**
 * Take-off from plans (phase 4c): the job whose plans this quote counts.
 * A quote for an existing job uses that job; otherwise a Quoting job is
 * made at the quote's site (docs/stage-2-projects.md "Quoting jobs"),
 * which becomes the real job when the quote is accepted.
 */
export async function startTakeoff(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const quote = await ownQuote(db, companyId, id);
  if (quote.projectId) return { projectId: quote.projectId, made: false };
  if (quote.uploadedFileId) throw conflict("This quote was made outside Grid, so it has no lines to take off into");
  if (quote.status === "ACCEPTED" || quote.status === "WITHDRAWN") throw conflict("This quote has been answered");
  if (!quote.siteId && !quote.siteAddress) throw badRequest("Add the site address to the quote first, so the plans know where they're for");
  const projectId = await makeJobFromQuote(ctx, quote, { quoting: true });
  await db.$transaction(async (tx) => {
    await tx.quote.update({ where: { id }, data: { projectId } });
    await event(tx, id, "JOB_CREATED", ctx.userId, "Quoting job made for the take-off");
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Quote", entityId: id, action: "takeoff_started", diff: { projectId } });
  });
  return { projectId, made: true };
}

/**
 * The customer said yes by phone, email or in person, and you're recording
 * it (online signing is in public.ts). Makes the job from it, unless it was
 * quoted for an existing job.
 */
export async function acceptQuote(ctx: RequestContext, id: string, input: { note?: string; createJob: boolean }) {
  const companyId = requireCompany(ctx);
  const quote = await ownQuote(db, companyId, id);
  if (quote.status !== "SENT") throw conflict(quote.status === "DRAFT" ? "Send the quote before marking it accepted" : "This quote isn't waiting for an answer");

  let projectId = quote.projectId;
  if (!projectId && input.createJob) projectId = await makeJobFromQuote(ctx, quote);
  await db.$transaction(async (tx) => {
    await revokeSignRequests(tx, MOD, id, "Accepted another way");
    await tx.quote.update({
      where: { id },
      data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedHow: "RECORDED_BY_STAFF", acceptedNote: input.note ?? null, projectId },
    });
    await event(tx, id, "ACCEPTED", ctx.userId, input.note ? `Recorded by staff: ${input.note}` : "Recorded by staff");
    if (projectId && !quote.projectId) await event(tx, id, "JOB_CREATED", ctx.userId);
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Quote", entityId: id, action: "accepted", diff: { how: "RECORDED_BY_STAFF", projectId } });
  });
  await emit("quotes.accepted", { quoteId: id, projectId }, ctx);
  return { id, projectId };
}

export async function declineQuote(ctx: RequestContext, id: string, reason?: string) {
  const companyId = requireCompany(ctx);
  const projectId = await db.$transaction(async (tx) => {
    const quote = await ownQuote(tx, companyId, id);
    if (quote.status !== "SENT") throw conflict("This quote isn't waiting for an answer");
    await tx.quote.update({ where: { id }, data: { status: "DECLINED", declinedAt: new Date(), declineReason: reason ?? null } });
    await revokeSignRequests(tx, MOD, id, "Declined another way");
    await event(tx, id, "DECLINED", ctx.userId, reason);
    return quote.projectId;
  });
  await emit("quotes.declined", { quoteId: id, projectId }, ctx);
  return { id };
}

export async function withdrawQuote(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const projectId = await db.$transaction(async (tx) => {
    const quote = await ownQuote(tx, companyId, id);
    if (quote.status !== "SENT" && quote.status !== "DRAFT") throw conflict("This quote can't be withdrawn now");
    await tx.quote.update({ where: { id }, data: { status: "WITHDRAWN" } });
    await revokeSignRequests(tx, MOD, id, "Withdrawn");
    await event(tx, id, "WITHDRAWN", ctx.userId);
    return quote.projectId;
  });
  await emit("quotes.withdrawn", { quoteId: id, projectId }, ctx);
  return { id };
}

export async function deleteDraft(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const quote = await ownQuote(db, companyId, id);
  if (quote.status !== "DRAFT" || quote.revisions.length) throw conflict("Only a draft that was never sent can be deleted. Withdraw it instead.");
  await db.quote.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id, deleted: true };
}

/** /api/files asks this before handing over a quote PDF (sent revisions, and uploaded quotes). */
export async function canReadQuoteFile(ctx: RequestContext, fileId: string) {
  if (!ctx.companyId || !ctx.permissions.has("quotes.view")) return false;
  const revision = await db.quoteRevision.findFirst({ where: { pdfFileId: fileId, quote: { companyId: ctx.companyId } } });
  if (revision) return true;
  return !!(await db.quote.findFirst({ where: { uploadedFileId: fileId, companyId: ctx.companyId } }));
}

/**
 * A quote made outside Grid: its PDF plus the few details Grid needs to
 * track it (number, client, total, address). Waiting for an answer, or
 * already accepted (e.g. attached to a job that's under way). Accepting it
 * later makes the job, the same as a Grid quote.
 */
export async function uploadQuote(ctx: RequestContext, input: UploadQuoteInput) {
  const companyId = requireCompany(ctx);
  // Attached to a job: it must be one you can see; it fills in the address.
  const job = input.projectId ? await getProject(ctx, input.projectId) : null;
  // At a site you picked (not for a job, which already says where).
  const place = !job && input.siteId ? await placeFor(ctx, input.siteId, input.buildingId ?? null, input.levelId ?? null) : null;
  const sentAt = input.sentOn ? new Date(`${input.sentOn}T12:00:00`) : new Date();
  const quote = await db.$transaction(async (tx) => {
    const settings = await taxSettings(companyId, tx);
    const client = input.clientId ? await requireClient(tx, companyId, input.clientId) : null;
    const number = input.number || (await nextNumber(tx, companyId, settings.quotePrefix));
    if (await tx.quote.findFirst({ where: { companyId, number } })) throw conflict(`There's already a quote ${number}. Use a different number.`);
    await attachFile(tx, input.fileId, { companyId, userId: ctx.userId, blockId: MOD });
    const accepted = input.status === "ACCEPTED";
    const quote = await tx.quote.create({
      data: {
        companyId,
        number,
        title: input.title,
        clientId: client?.id ?? null,
        siteAddress: input.siteAddress ?? job?.site.address ?? place?.address ?? client?.address ?? null,
        projectId: job?.id ?? null,
        siteId: place?.siteId ?? null,
        buildingId: place?.buildingId ?? null,
        levelId: place?.levelId ?? null,
        status: accepted ? "ACCEPTED" : "SENT",
        pricesIncludeTax: true,
        validUntil: new Date(sentAt.getTime() + settings.validityDays * 86_400_000),
        sentAt,
        createdById: ctx.userId,
        uploadedFileId: input.fileId,
        uploadedTotal: input.total ?? null,
        ...(accepted ? { acceptedAt: new Date(), acceptedHow: "RECORDED_BY_STAFF" } : {}),
      },
    });
    await event(tx, quote.id, "CREATED", ctx.userId, "Uploaded a PDF made outside Grid");
    if (accepted) await event(tx, quote.id, "ACCEPTED", ctx.userId, "Recorded when uploaded");
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      projectId: job?.id ?? null,
      entityType: "Quote",
      entityId: quote.id,
      action: "uploaded",
      diff: { number, title: input.title, total: input.total ?? null, status: quote.status },
    });
    return quote;
  });
  await emit("quotes.created", { quoteId: quote.id }, ctx);
  return { id: quote.id, number: quote.number };
}

/** The quote a job came from (job page panel). */
export async function quoteForJob(ctx: RequestContext, projectId: string) {
  const companyId = requireCompany(ctx);
  const quote = await db.quote.findFirst({ where: { companyId, projectId, deletedAt: null }, include: { lines: true }, orderBy: { createdAt: "desc" } });
  if (!quote) return null;
  const settings = await taxSettings(companyId);
  const totals = calculate(linesForMaths(quote.lines), mathSettings(quote, settings));
  const agreed = (await acceptedTotals([quote])).get(quote.currentRevisionId ?? "");
  const total = quote.uploadedTotal != null ? cents(quote.uploadedTotal)! : (agreed ?? totals.totalCents);
  return { id: quote.id, number: quote.number, status: quote.status, total: formatMoney(total, settings.currency, settings.locale) };
}
