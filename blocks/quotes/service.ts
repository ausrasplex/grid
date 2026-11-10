// Public service API of the quotes block (docs/quotations-block.md, phase 3a).
//
// A quote is edited as a draft (Quote + QuoteLine). Sending freezes it into
// a revision (Rev A, B…) with a snapshot and a PDF, so nothing about a sent
// quote changes later. "Edit" on a sent quote reopens it as a draft; the
// next send is the next revision.

import { app, badRequest, conflict, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db, readStoredFile, saveGeneratedFile, type Prisma, type Tx } from "@grid/db";
import { createProject } from "@grid/block-projects";
import { createSignRequest, latestSignRequest, maskEmail, revokeSignRequests } from "@grid/block-signatures";
import { calculate, formatMoney, type LineInput } from "./money";
import { totalsFor, type QuoteSnapshot } from "./snapshot";

export type { QuoteSnapshot } from "./snapshot";
import type {
  ClientInput,
  CreateQuoteInput,
  PriceItemInput,
  SendInput,
  TaxCodeInput,
  TaxSettingsInput,
  UpdateQuoteInput,
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
  let codes = await tx.taxCode.findMany({ where: { companyId }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
  if (!taxSettings) {
    if (!codes.length) {
      await tx.taxCode.createMany({
        data: [
          { companyId, name: "GST 10%", label: "GST", rate: 0.1, sort: 0 },
          { companyId, name: "GST-free", label: "GST-free", rate: 0, sort: 1 },
        ],
      });
      codes = await tx.taxCode.findMany({ where: { companyId }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
    }
    taxSettings = await tx.taxSettings.create({ data: { companyId, defaultTaxCodeId: codes[0]?.id ?? null } });
  }
  return { ...taxSettings, codes: codes.map((code) => ({ id: code.id, name: code.name, label: code.label, rate: Number(code.rate), ratePct: Number(code.rate) * 100, active: code.active })) };
}

export type TaxSettingsView = Awaited<ReturnType<typeof taxSettings>>;

export async function getTaxSettings(ctx: RequestContext) {
  return taxSettings(requireCompany(ctx));
}

export async function updateTaxSettings(ctx: RequestContext, input: TaxSettingsInput) {
  const companyId = requireCompany(ctx);
  await taxSettings(companyId);
  if (input.defaultTaxCodeId && !(await db.taxCode.findFirst({ where: { id: input.defaultTaxCodeId, companyId } }))) {
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
    const result = await db.taxCode.updateMany({ where: { id, companyId }, data });
    if (!result.count) throw notFound("Tax code not found");
  } else {
    const codeCount = await db.taxCode.count({ where: { companyId } });
    await db.taxCode.create({ data: { companyId, ...data, sort: codeCount } });
  }
  return taxSettings(companyId);
}

// ---------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------

export async function listClients(ctx: RequestContext, query = "") {
  const companyId = requireCompany(ctx);
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  return db.client.findMany({
    where: {
      companyId,
      deletedAt: null,
      AND: words.map((word) => ({
        OR: [
          { name: { contains: word, mode: "insensitive" as const } },
          { contactName: { contains: word, mode: "insensitive" as const } },
          { email: { contains: word, mode: "insensitive" as const } },
          { address: { contains: word, mode: "insensitive" as const } },
        ],
      })),
    },
    orderBy: { name: "asc" },
    take: 200,
  });
}

export async function saveClient(ctx: RequestContext, id: string | null, input: ClientInput) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    let client;
    if (id) {
      const result = await tx.client.updateMany({ where: { id, companyId, deletedAt: null }, data: input });
      if (!result.count) throw notFound("Client not found");
      client = await tx.client.findUniqueOrThrow({ where: { id } });
    } else {
      client = await tx.client.create({ data: { companyId, ...input } });
    }
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Client", entityId: client.id, action: id ? "updated" : "created" });
    return client;
  });
}

export async function deleteClient(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const result = await db.client.updateMany({ where: { id, companyId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (!result.count) throw notFound("Client not found");
  return { id, deleted: true };
}

// ---------------------------------------------------------------------
// Price book
// ---------------------------------------------------------------------

function priceItemView(item: Prisma.PriceItemGetPayload<object>, showCost: boolean) {
  return {
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

export async function listPriceItems(ctx: RequestContext, options: { q?: string; kind?: "LABOUR" | "MATERIAL" } = {}) {
  const companyId = requireCompany(ctx);
  const words = (options.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const rows = await db.priceItem.findMany({
    where: {
      companyId,
      deletedAt: null,
      ...(options.kind ? { kind: options.kind } : {}),
      AND: words.map((word) => ({
        OR: [
          { name: { contains: word, mode: "insensitive" as const } },
          { supplierCode: { contains: word, mode: "insensitive" as const } },
          { supplier: { contains: word, mode: "insensitive" as const } },
        ],
      })),
    },
    orderBy: [{ favourite: "desc" }, { name: "asc" }],
    take: 300,
  });
  const showCost = ctx.permissions.has("quotes.costs.view");
  return rows.map((row) => priceItemView(row, showCost));
}

export async function savePriceItem(ctx: RequestContext, id: string | null, input: PriceItemInput) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    let item;
    if (id) {
      const result = await tx.priceItem.updateMany({ where: { id, companyId, deletedAt: null }, data: input });
      if (!result.count) throw notFound("Price book item not found");
      item = await tx.priceItem.findUniqueOrThrow({ where: { id } });
    } else {
      item = await tx.priceItem.create({ data: { companyId, ...input } });
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

// ---------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------

const quoteInclude = {
  client: true,
  lines: { orderBy: { sort: "asc" } },
  revisions: { orderBy: { sentAt: "asc" }, select: { id: true, label: true, sentAt: true, sentTo: true, pdfFileId: true, sentById: true } },
  events: { orderBy: { at: "desc" }, take: 50 },
} satisfies Prisma.QuoteInclude;

type QuoteRow = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;

async function ownQuote(tx: Tx, companyId: string, id: string): Promise<QuoteRow> {
  const quote = await tx.quote.findFirst({ where: { id, companyId, deletedAt: null }, include: quoteInclude });
  if (!quote) throw notFound("Quote not found");
  return quote;
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

function linesForMaths(lines: { qty: Prisma.Decimal | number; sell: Prisma.Decimal | number; cost: Prisma.Decimal | number | null; taxCodeId: string | null; optional: boolean }[]): LineInput[] {
  return lines.map((line) => ({
    qty: Number(line.qty),
    unitCents: cents(line.sell)!,
    unitCostCents: cents(line.cost),
    taxCodeId: line.taxCodeId,
    optional: line.optional,
  }));
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

export async function listQuotes(ctx: RequestContext, options: { tab?: "open" | "draft" | "sent" | "won" | "all"; q?: string } = {}) {
  const companyId = requireCompany(ctx);
  const tab = options.tab ?? "open";
  const status: Prisma.QuoteWhereInput["status"] =
    tab === "draft" ? "DRAFT" : tab === "sent" ? "SENT" : tab === "won" ? "ACCEPTED" : tab === "open" ? { in: ["DRAFT", "SENT"] } : undefined;
  const words = (options.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const rows = await db.quote.findMany({
    where: {
      companyId,
      deletedAt: null,
      ...(status ? { status } : {}),
      AND: words.map((word) => ({
        OR: [
          { number: { contains: word, mode: "insensitive" as const } },
          { title: { contains: word, mode: "insensitive" as const } },
          { siteAddress: { contains: word, mode: "insensitive" as const } },
          { client: { name: { contains: word, mode: "insensitive" as const } } },
        ],
      })),
    },
    include: { client: { select: { name: true } }, lines: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const settings = await taxSettings(companyId);
  const agreed = await acceptedTotals(rows);
  return rows.map((row) => {
    const totals = calculate(linesForMaths(row.lines), { pricesIncludeTax: row.pricesIncludeTax, rounding: settings.rounding as "LINE" | "TOTAL", codes: settings.codes });
    return {
      id: row.id,
      number: row.number,
      title: row.title,
      clientName: row.client?.name ?? null,
      siteAddress: row.siteAddress,
      status: row.status,
      totalCents: agreed.get(row.currentRevisionId ?? "") ?? totals.totalCents,
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
    if (input.clientId && !(await tx.client.findFirst({ where: { id: input.clientId, companyId, deletedAt: null } }))) throw badRequest("Client not found");
    const client = input.clientId ? await tx.client.findUnique({ where: { id: input.clientId } }) : null;
    const quote = await tx.quote.create({
      data: {
        companyId,
        number: await nextNumber(tx, companyId, settings.quotePrefix),
        title: input.title,
        clientId: input.clientId ?? null,
        siteAddress: input.siteAddress ?? client?.address ?? null,
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
  const totals = calculate(linesForMaths(quote.lines), { pricesIncludeTax: quote.pricesIncludeTax, rounding: settings.rounding as "LINE" | "TOTAL", codes: settings.codes });
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
    lines: quote.lines.map((line) => ({
      id: line.id,
      section: line.section,
      priceItemId: line.priceItemId,
      description: line.description,
      qty: Number(line.qty),
      unit: line.unit,
      cost: showCost && line.cost != null ? Number(line.cost) : null,
      sell: Number(line.sell),
      taxCodeId: line.taxCodeId,
      optional: line.optional,
    })),
    totals: { ...totals, costCents: showCost ? totals.costCents : 0, margin: showCost ? totals.margin : null },
    revisions: quote.revisions.map((revision) => ({ id: revision.id, label: revision.label, sentAt: revision.sentAt, sentTo: revision.sentTo, hasPdf: !!revision.pdfFileId, sentBy: names.get(revision.sentById) ?? "Someone" })),
    events: quote.events.map((event) => ({ type: event.type, at: event.at, by: event.byUserId ? (names.get(event.byUserId) ?? "Someone") : null, note: event.note })),
    settings: { currency: settings.currency, locale: settings.locale, taxName: settings.taxName, rounding: settings.rounding, defaultTaxCodeId: settings.defaultTaxCodeId, codes: settings.codes },
    canSeeCosts: showCost,
  };
}

export type QuoteView = Awaited<ReturnType<typeof getQuote>>;

/** Saves the draft. Lines are replaced as a whole (the editor sends them all). */
export async function updateQuote(ctx: RequestContext, id: string, input: UpdateQuoteInput) {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    const quote = await ownQuote(tx, companyId, id);
    if (quote.status !== "DRAFT") throw conflict("This quote has been sent. Tap Edit to make a new revision.");
    if (input.clientId && !(await tx.client.findFirst({ where: { id: input.clientId, companyId, deletedAt: null } }))) throw badRequest("Client not found");
    const { lines, ...fields } = input;
    await tx.quote.update({ where: { id }, data: fields });
    if (lines) {
      // Without permission to see costs, keep the costs that were there.
      const keepCosts = !ctx.permissions.has("quotes.costs.view");
      const oldCost = new Map(quote.lines.map((line) => [line.priceItemId ?? line.description, line.cost]));
      await tx.quoteLine.deleteMany({ where: { quoteId: id } });
      if (lines.length) {
        await tx.quoteLine.createMany({
          data: lines.map((line, index) => ({
            quoteId: id,
            sort: index,
            section: line.section ?? null,
            priceItemId: line.priceItemId ?? null,
            description: line.description,
            qty: line.qty,
            unit: line.unit,
            cost: keepCosts ? (oldCost.get(line.priceItemId ?? line.description) ?? null) : (line.cost ?? null),
            sell: line.sell,
            taxCodeId: line.taxCodeId,
            optional: line.optional,
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
  const mathSettings = { pricesIncludeTax: quote.pricesIncludeTax, rounding: settings.rounding as "LINE" | "TOTAL", codes: settings.codes };
  const totals = calculate(linesForMaths(quote.lines), mathSettings);
  const codeFor = (id: string | null) => settings.codes.find((code) => code.id === id);
  return {
    number: quote.number,
    revision,
    title: quote.title,
    date: day(new Date()),
    validUntil: day(quote.validUntil),
    client: quote.client ? { name: quote.client.name, contactName: quote.client.contactName, email: quote.client.email, phone: quote.client.phone, address: quote.client.address, abn: quote.client.abn } : null,
    siteAddress: quote.siteAddress,
    clientView: quote.clientView,
    intro: quote.intro,
    terms: quote.terms,
    lines: quote.lines.map((line, index) => ({
      section: line.section,
      description: line.description,
      qty: Number(line.qty),
      unit: line.unit,
      unitCents: cents(line.sell)!,
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

/** The PDF: a sent revision's stored copy, or a draft preview marked DRAFT. */
export async function quotePdf(ctx: RequestContext, id: string, options: { revisionId?: string | null; download?: boolean; signed?: boolean } = {}) {
  const companyId = requireCompany(ctx);
  const quote = await ownQuote(db, companyId, id);
  if (options.signed) {
    const request = quote.signRequestId ? await db.signRequest.findUnique({ where: { id: quote.signRequestId } }) : null;
    if (!request?.signedPdfFileId) throw notFound("This quote wasn't signed online");
    const file = await db.storedFile.findUniqueOrThrow({ where: { id: request.signedPdfFileId } });
    return pdfResponse(await readStoredFile(file), `${quote.number} signed.pdf`, !!options.download);
  }
  const revision = options.revisionId ? quote.revisions.find((revision) => revision.id === options.revisionId) : quote.status !== "DRAFT" ? quote.revisions.at(-1) : undefined;
  if (revision?.pdfFileId) {
    const file = await db.storedFile.findUniqueOrThrow({ where: { id: revision.pdfFileId } });
    return pdfResponse(await readStoredFile(file), `${quote.number} Rev ${revision.label}.pdf`, !!options.download);
  }
  const snapshot = await buildSnapshot(companyId, id, ctx.userId, null);
  return pdfResponse(await renderQuotePdf(companyId, snapshot, true), `${quote.number} draft.pdf`, !!options.download);
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
  return db.$transaction(async (tx) => {
    const quote = await ownQuote(tx, companyId, id);
    if (quote.status !== "SENT" && quote.status !== "DECLINED" && quote.status !== "EXPIRED") throw conflict("Only a sent, declined or expired quote can be revised");
    await tx.quote.update({ where: { id }, data: { status: "DRAFT", declinedAt: null, declineReason: null, viewedAt: null } });
    await revokeSignRequests(tx, MOD, id, "Being revised");
    await event(tx, id, "REOPENED", ctx.userId, `Editing for Rev ${String.fromCharCode(65 + quote.revisions.length)}`);
    return { id };
  });
}

/** Makes the job an accepted quote turns into (at its site address). */
export async function makeJobFromQuote(ctx: RequestContext, quote: { title: string; number: string; siteAddress: string | null; client: { name: string } | null }) {
  if (!quote.siteAddress) throw badRequest("Add the site address to the quote, so the job knows where it is");
  const job = await createProject(ctx, {
    name: quote.title,
    clientName: quote.client?.name,
    address: quote.siteAddress,
    references: [{ label: "Quote", value: quote.number }],
  });
  return job.id;
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
  return db.$transaction(async (tx) => {
    const quote = await ownQuote(tx, companyId, id);
    if (quote.status !== "SENT") throw conflict("This quote isn't waiting for an answer");
    await tx.quote.update({ where: { id }, data: { status: "DECLINED", declinedAt: new Date(), declineReason: reason ?? null } });
    await revokeSignRequests(tx, MOD, id, "Declined another way");
    await event(tx, id, "DECLINED", ctx.userId, reason);
    return { id };
  });
}

export async function withdrawQuote(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  return db.$transaction(async (tx) => {
    const quote = await ownQuote(tx, companyId, id);
    if (quote.status !== "SENT" && quote.status !== "DRAFT") throw conflict("This quote can't be withdrawn now");
    await tx.quote.update({ where: { id }, data: { status: "WITHDRAWN" } });
    await revokeSignRequests(tx, MOD, id, "Withdrawn");
    await event(tx, id, "WITHDRAWN", ctx.userId);
    return { id };
  });
}

export async function deleteDraft(ctx: RequestContext, id: string) {
  const companyId = requireCompany(ctx);
  const quote = await ownQuote(db, companyId, id);
  if (quote.status !== "DRAFT" || quote.revisions.length) throw conflict("Only a draft that was never sent can be deleted. Withdraw it instead.");
  await db.quote.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id, deleted: true };
}

/** /api/files asks this before handing over a quote PDF. */
export async function canReadQuoteFile(ctx: RequestContext, fileId: string) {
  if (!ctx.companyId || !ctx.permissions.has("quotes.view")) return false;
  const revision = await db.quoteRevision.findFirst({ where: { pdfFileId: fileId, quote: { companyId: ctx.companyId } } });
  return !!revision;
}

/** The quote a job came from (job page panel). */
export async function quoteForJob(ctx: RequestContext, projectId: string) {
  const companyId = requireCompany(ctx);
  const quote = await db.quote.findFirst({ where: { companyId, projectId, deletedAt: null }, include: { lines: true }, orderBy: { createdAt: "desc" } });
  if (!quote) return null;
  const settings = await taxSettings(companyId);
  const totals = calculate(linesForMaths(quote.lines), { pricesIncludeTax: quote.pricesIncludeTax, rounding: settings.rounding as "LINE" | "TOTAL", codes: settings.codes });
  const agreed = (await acceptedTotals([quote])).get(quote.currentRevisionId ?? "");
  return { id: quote.id, number: quote.number, status: quote.status, total: formatMoney(agreed ?? totals.totalCents, settings.currency, settings.locale) };
}
