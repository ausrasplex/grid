// Row sign-offs (phase 5b part 3, docs/documents-block.md "Row sign-offs").
// Everything goes through spreadsheetForBlock() from Documents, which checks
// the person may see the document (and its job).

import "server-only";
import { randomUUID } from "node:crypto";
import { badRequest, can, conflict, forbidden, requireCompany, type RequestContext } from "@grid/core";
import { audit, db, type Tx } from "@grid/db";
import { spreadsheetForBlock } from "@grid/block-documents";
import { isJobArchived } from "@grid/block-projects";
import { matchColumnFor, rowKeys, rowStates, type RowState, type SignoffEntry } from "./keys";
import type { EntryInput } from "./validation";

const MOD = "signoffs";

async function names(userIds: string[]) {
  const users = await db.user.findMany({ where: { id: { in: [...new Set(userIds)] } }, select: { id: true, name: true } });
  return new Map(users.map((user) => [user.id, user.name]));
}

async function entriesOf(companyId: string, documentId: string, tx: Tx = db): Promise<SignoffEntry[]> {
  const rows = await tx.sheetSignoff.findMany({ where: { companyId, documentId }, orderBy: [{ at: "asc" }, { id: "asc" }] });
  const people = await names(rows.map((row) => row.byId));
  return rows.map((row) => ({
    id: row.id,
    sheetName: row.sheetName,
    rowKey: row.rowKey,
    signedOff: row.signedOff,
    note: row.note,
    rowText: row.rowText,
    byId: row.byId,
    byName: people.get(row.byId) ?? "Someone",
    at: row.at.toISOString(),
  }));
}

async function settingsOf(companyId: string, documentId: string) {
  const rows = await db.sheetSignoffSettings.findMany({ where: { companyId, documentId } });
  return Object.fromEntries(rows.map((row) => [row.sheetName, row.matchColumn]));
}

/** A document's sign-offs (every sheet, with history) and each sheet's match column setting. */
export async function documentSignoffs(ctx: RequestContext, documentId: string) {
  const companyId = requireCompany(ctx);
  const sheet = await spreadsheetForBlock(ctx, documentId);
  return {
    entries: await entriesOf(companyId, sheet.document.id),
    /** Sheet name → header name, "" (whole row) or null (Grid's guess). Sheets not listed use the guess. */
    matchColumns: (await settingsOf(companyId, sheet.document.id)) as Record<string, string | null>,
    archived: sheet.document.projectId ? await isJobArchived(sheet.document.projectId) : false,
    /** Download with sign-offs follows the document's "Allow download". */
    canDownload: sheet.document.allowDownload || can(ctx, "documents.edit"),
  };
}

async function writable(ctx: RequestContext, documentId: string) {
  const sheet = await spreadsheetForBlock(ctx, documentId);
  if (sheet.document.projectId && (await isJobArchived(sheet.document.projectId))) throw conflict("This job is archived. Restore it to sign off rows.");
  return sheet;
}

/**
 * Sign-offs and undos from the phone, possibly sent late (no signal). One
 * already received (same id) is skipped. Undoing someone else's needs
 * signoffs.manage. If two people sign off the same row, both are kept and
 * the first stands.
 */
export async function addEntries(ctx: RequestContext, documentId: string, input: EntryInput[]) {
  const companyId = requireCompany(ctx);
  const sheet = await writable(ctx, documentId);
  const manage = can(ctx, "signoffs.manage");
  const now = Date.now();
  await db.$transaction(async (tx) => {
    const known = new Set((await tx.sheetSignoff.findMany({ where: { id: { in: input.map((entry) => entry.id) } }, select: { id: true } })).map((row) => row.id));
    const fresh = input.filter((entry) => !known.has(entry.id));
    if (!fresh.length) return;
    // Who signed off each row now, to check undos against.
    const states = new Map<string, Map<string, RowState>>();
    const current = await entriesOf(companyId, sheet.document.id, tx);
    for (const entry of fresh) {
      if (!states.has(entry.sheetName)) states.set(entry.sheetName, rowStates(current, entry.sheetName));
      const state = states.get(entry.sheetName)!.get(entry.rowKey);
      if (!entry.signedOff && state?.by && state.by.byId !== ctx.userId && !manage) throw forbidden(`${state.by.byName} signed that row off. Only someone who manages sign-offs can undo it.`);
      // The phone's time, but never in the future, and never before the last 60 days.
      const at = new Date(Math.min(now, Math.max(now - 60 * 86_400_000, Date.parse(entry.at))));
      await tx.sheetSignoff.create({
        data: { id: entry.id, companyId, documentId: sheet.document.id, sheetName: entry.sheetName, rowKey: entry.rowKey, signedOff: entry.signedOff, note: entry.note || null, rowText: entry.rowText, byId: ctx.userId, at },
      });
      await audit(tx, {
        blockId: MOD,
        actorId: ctx.userId,
        companyId,
        projectId: sheet.document.projectId,
        entityType: "SheetSignoff",
        entityId: entry.id,
        action: entry.signedOff ? "signed_off" : "undone",
        diff: { document: sheet.document.title, sheet: entry.sheetName, row: entry.rowText, note: entry.note || undefined },
      });
    }
  });
  return { entries: await entriesOf(companyId, sheet.document.id) };
}

/**
 * Which column names each row on a sheet. Sign-offs already made are moved
 * to the new keys (worked out on the current version), so none are lost.
 */
export async function setMatchColumn(ctx: RequestContext, documentId: string, sheetName: string, matchColumn: string | null) {
  const companyId = requireCompany(ctx);
  const sheet = await writable(ctx, documentId);
  const index = sheet.sheets.findIndex((summary) => summary.name === sheetName);
  if (index < 0 || !sheet.version.ready) throw badRequest("That sheet isn't on the current version");
  const data = await sheet.readSheet(index);
  const headerRow = Math.min(sheet.sheets[index]!.headerRow, Math.max(0, data.cells.length - 1));
  if (matchColumn && !matchColumnFor(data.cells, headerRow, matchColumn)) throw badRequest(`There's no "${matchColumn}" column on ${sheetName}`);
  const before = (await db.sheetSignoffSettings.findUnique({ where: { documentId_sheetName: { documentId: sheet.document.id, sheetName } } }))?.matchColumn ?? null;
  const oldKeys = rowKeys(data.cells, headerRow, matchColumnFor(data.cells, headerRow, before));
  const newKeys = rowKeys(data.cells, headerRow, matchColumnFor(data.cells, headerRow, matchColumn));
  await db.$transaction(async (tx) => {
    await tx.sheetSignoffSettings.upsert({
      where: { documentId_sheetName: { documentId: sheet.document.id, sheetName } },
      create: { documentId: sheet.document.id, sheetName, companyId, matchColumn },
      update: { matchColumn },
    });
    // Move each row's history to its new key: first to a temporary key, so two rows swapping keys can't mix.
    const moves = oldKeys.flatMap((oldKey, row) => (oldKey && newKeys[row] && oldKey !== newKeys[row] ? [{ from: oldKey, to: newKeys[row]!, temporary: `t:${randomUUID()}` }] : []));
    for (const move of moves) await tx.sheetSignoff.updateMany({ where: { companyId, documentId: sheet.document.id, sheetName, rowKey: move.from }, data: { rowKey: move.temporary } });
    for (const move of moves) await tx.sheetSignoff.updateMany({ where: { companyId, documentId: sheet.document.id, sheetName, rowKey: move.temporary }, data: { rowKey: move.to } });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      projectId: sheet.document.projectId,
      entityType: "SheetSignoffSettings",
      entityId: `${sheet.document.id}:${sheetName}`,
      action: "match_column_changed",
      diff: { document: sheet.document.title, sheet: sheetName, from: before, to: matchColumn },
    });
  });
  return documentSignoffs(ctx, documentId);
}

/** Undo many rows at once: clearing a sheet, or sign-offs that no longer match a row. */
export async function clearRows(ctx: RequestContext, documentId: string, sheetName: string, keys: string[]) {
  const companyId = requireCompany(ctx);
  const sheet = await writable(ctx, documentId);
  const states = rowStates(await entriesOf(companyId, sheet.document.id), sheetName);
  const signed = [...new Set(keys)].filter((key) => states.get(key)?.signedOff);
  if (!signed.length) return documentSignoffs(ctx, documentId);
  const at = new Date();
  await db.$transaction(async (tx) => {
    await tx.sheetSignoff.createMany({
      data: signed.map((rowKey) => ({ id: randomUUID(), companyId, documentId: sheet.document.id, sheetName, rowKey, signedOff: false, rowText: states.get(rowKey)!.by?.rowText ?? "", byId: ctx.userId, at })),
    });
    await audit(tx, {
      blockId: MOD,
      actorId: ctx.userId,
      companyId,
      projectId: sheet.document.projectId,
      entityType: "SheetSignoff",
      entityId: `${sheet.document.id}:${sheetName}`,
      action: "cleared",
      diff: { document: sheet.document.title, sheet: sheetName, rows: signed.length },
    });
  });
  return documentSignoffs(ctx, documentId);
}

const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const safeName = (title: string) => title.replace(/[^\w .()-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "Spreadsheet";

/** "Download with sign-offs": a copy of the current version with Signed off, By, When and Note columns added. */
export async function exportWithSignoffs(ctx: RequestContext, documentId: string) {
  const companyId = requireCompany(ctx);
  const sheet = await spreadsheetForBlock(ctx, documentId);
  if (!sheet.document.allowDownload && !can(ctx, "documents.edit")) throw forbidden("This document can't be downloaded");
  if (!sheet.version.ready) throw conflict("Grid is still reading the spreadsheet (or it was put away with an archived job). Open it, wait for it to show, then try again.");
  const entries = await entriesOf(companyId, sheet.document.id);
  const settings = await settingsOf(companyId, sheet.document.id);
  const additions: Parameters<typeof sheet.copyWithColumns>[0] = {};
  for (const [index, summary] of sheet.sheets.entries()) {
    const data = await sheet.readSheet(index);
    const headerRow = Math.min(summary.headerRow, Math.max(0, data.cells.length - 1));
    const keys = rowKeys(data.cells, headerRow, matchColumnFor(data.cells, headerRow, settings[summary.name] ?? null));
    const states = rowStates(entries, summary.name);
    const rows = new Map<number, string[]>();
    keys.forEach((key, row) => {
      const state = key ? states.get(key) : undefined;
      if (key) rows.set(data.rowNumbers[row]!, state?.signedOff && state.by ? ["Yes", state.by.byName, when(state.by.at), state.by.note ?? ""] : ["No", "", "", ""]);
    });
    additions[summary.name] = { headerRowNumber: data.rowNumbers[headerRow] ?? 1, headers: ["Signed off", "By", "When", "Sign-off note"], rows };
  }
  const buffer = await sheet.copyWithColumns(additions);
  await db.$transaction((tx) =>
    audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, projectId: sheet.document.projectId, entityType: "SheetSignoff", entityId: sheet.document.id, action: "exported", diff: { document: sheet.document.title } }),
  );
  const fileName = `${safeName(sheet.document.title)} with sign-offs.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${fileName.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "cache-control": "private, no-store",
    },
  });
}

/** What the viewer gets for a document. */
export type DocumentSignoffs = Awaited<ReturnType<typeof documentSignoffs>>;

/** The person signing, for sign-offs shown before the server has them. */
export async function me(ctx: RequestContext) {
  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { id: true, name: true } });
  return { id: ctx.userId, name: user?.name ?? "You" };
}
