// Search inside documents (phase 5b part 4, docs/documents-block.md "Search").
//   - Each version's text is read once: a PDF's words with pdftotext
//     (page text into DocumentPage for PostgreSQL full-text search, and the
//     words with their boxes into the cache for "find on page"), a
//     spreadsheet's cell text per sheet. Runs after the version is read
//     for the viewer ("documents.render"), and overnight for older ones
//     ("documents.text").
//   - search(): every library document and the job documents of jobs this
//     person can see, current versions only, best match first, with the
//     matching words marked « » in a short snippet.
//   - findInVersion(): where words appear on a PDF's pages, as boxes for
//     the viewer to highlight.
// Scans have no text (textPages 0): OCR comes later.

import "server-only";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { badRequest, requireCompany, type RequestContext } from "@grid/core";
import { db, findWords, pageText, pdfWords, storedFilePath, type PdfWord } from "@grid/db";
import { canSeeJob } from "@grid/block-projects";
import { documentKind } from "./kinds";
import { pagesDir, sheetFile } from "./render";
import type { SheetData, SheetSummary } from "./sheets";

const WORDS_FILE = "words.json";
/** Far more than any real page; keeps a runaway sheet from making a huge search row. */
const MAX_TEXT = 500_000;

const exists = (file: string) => stat(/*turbopackIgnore: true*/ file).then(() => true, () => false);

/** Reads a version's text for search (and a PDF's word boxes). Safe to run again. */
export async function extractText(versionId: string) {
  const version = await db.documentVersion.findUnique({ where: { id: versionId }, include: { document: { select: { id: true, companyId: true } } } });
  if (!version) return;
  const file = await db.storedFile.findUnique({ where: { id: version.fileId } });
  if (!file || file.purgedAt) return;
  const kind = documentKind(file.mime);
  const rows: { page: number; sheetName: string | null; text: string }[] = [];

  if (kind === "pdf") {
    const pages = await pdfWords(storedFilePath(file));
    pages.forEach((page, index) => rows.push({ page: index + 1, sheetName: null, text: pageText(page).slice(0, MAX_TEXT) }));
    // The boxes go beside the page pictures (archived jobs have none until opened).
    const folder = pagesDir(versionId);
    if (await exists(folder)) await writeFile(path.join(folder, WORDS_FILE), JSON.stringify(pages.map((page) => page.words)));
  } else if (kind === "spreadsheet") {
    const sheets = (version.sheets ?? []) as unknown as SheetSummary[];
    for (const [index, summary] of sheets.entries()) {
      let data: SheetData;
      try {
        data = JSON.parse(await readFile(path.join(pagesDir(versionId), sheetFile(index)), "utf8")) as SheetData;
      } catch {
        return; // Not read yet, or put away with an archived job: try again later.
      }
      const text = data.cells
        .map((row) => row.filter((cell) => cell.trim() !== "").join(" "))
        .filter(Boolean)
        .join("\n");
      rows.push({ page: index + 1, sheetName: summary.name, text: text.slice(0, MAX_TEXT) });
    }
  }

  const filled = rows.filter((row) => row.text.trim() !== "");
  await db.$transaction(
    async (tx) => {
      await tx.documentPage.deleteMany({ where: { versionId } });
      if (filled.length) await tx.documentPage.createMany({ data: filled.map((row) => ({ companyId: version.document.companyId, documentId: version.document.id, versionId, ...row })) });
      await tx.$executeRaw`UPDATE "DocumentPage" SET "search" = to_tsvector('english', "text") WHERE "versionId" = ${versionId}`;
      await tx.documentVersion.update({ where: { id: versionId }, data: { textAt: new Date(), textPages: filled.length } });
    },
    { timeout: 120_000 },
  );
}

/** Nightly: read the text of versions from before search, a few hundred at a time. */
export async function extractMissing() {
  const versions = await db.documentVersion.findMany({ where: { status: "READY", textAt: null, document: { purgedAt: null } }, select: { id: true }, orderBy: { createdAt: "desc" }, take: 300 });
  for (const version of versions) {
    try {
      await extractText(version.id);
    } catch (error) {
      console.error(`[documents] couldn't read the text of version ${version.id}`, error);
    }
  }
  return { read: versions.length };
}

export interface SearchHit {
  documentId: string;
  title: string;
  /** "Manuals", or the job's name. */
  where: string;
  libraryId: string | null;
  projectId: string | null;
  versionId: string;
  kind: string;
  /** Best pages (or sheets) first: page number, the sheet's name, and a snippet with matches between « and ». */
  pages: { page: number; sheetName: string | null; snippet: string }[];
}

interface Row {
  documentId: string;
  versionId: string;
  page: number;
  sheetName: string | null;
  rank: number;
  snippet: string;
}

/**
 * Searches inside documents: words, phrases in "quotes", -word to leave
 * out (websearch_to_tsquery). Words are matched by their stem ("trips"
 * finds "trip"). Only current versions; job documents only on jobs this
 * person can see. `projectId` limits it to one job's documents.
 */
export async function search(ctx: RequestContext, typed: string, projectId: string | null = null): Promise<SearchHit[]> {
  const companyId = requireCompany(ctx);
  const query = typed.trim().slice(0, 200);
  if (query.length < 2) throw badRequest("Type at least two letters");
  if (projectId && !(await canSeeJob(ctx, projectId))) return [];
  const options = "MaxWords=22, MinWords=8, MaxFragments=2, FragmentDelimiter=\" … \", StartSel=«, StopSel=»";
  const rows = projectId
    ? await db.$queryRaw<Row[]>`
        SELECT p."documentId", p."versionId", p."page", p."sheetName", ts_rank(p."search", q) AS rank,
               ts_headline('english', left(p."text", 50000), q, ${options}) AS snippet
        FROM "DocumentPage" p
        JOIN "LibraryDocument" d ON d."id" = p."documentId" AND d."currentVersionId" = p."versionId"
        CROSS JOIN websearch_to_tsquery('english', ${query}) q
        WHERE p."companyId" = ${companyId} AND d."deletedAt" IS NULL AND d."purgedAt" IS NULL
          AND d."projectId" = ${projectId} AND p."search" @@ q
        ORDER BY rank DESC LIMIT 300`
    : await db.$queryRaw<Row[]>`
        SELECT p."documentId", p."versionId", p."page", p."sheetName", ts_rank(p."search", q) AS rank,
               ts_headline('english', left(p."text", 50000), q, ${options}) AS snippet
        FROM "DocumentPage" p
        JOIN "LibraryDocument" d ON d."id" = p."documentId" AND d."currentVersionId" = p."versionId"
        CROSS JOIN websearch_to_tsquery('english', ${query}) q
        WHERE p."companyId" = ${companyId} AND d."deletedAt" IS NULL AND d."purgedAt" IS NULL AND p."search" @@ q
        ORDER BY rank DESC LIMIT 300`;
  if (!rows.length) return [];

  const documents = await db.libraryDocument.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.documentId))] }, companyId },
    select: { id: true, title: true, libraryId: true, projectId: true, library: { select: { name: true, deletedAt: true } } },
  });
  const files = new Map(
    (await db.documentVersion.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.versionId))] } }, select: { id: true, fileId: true } })).map((version) => [version.id, version.fileId]),
  );
  const mimes = new Map((await db.storedFile.findMany({ where: { id: { in: [...files.values()] } }, select: { id: true, mime: true } })).map((file) => [file.id, file.mime]));
  // Job documents: only jobs this person can see (asked once per job).
  const jobs = new Map<string, string | null>();
  for (const id of new Set(documents.flatMap((document) => (document.projectId ? [document.projectId] : [])))) {
    if (!(await canSeeJob(ctx, id))) {
      jobs.set(id, null);
      continue;
    }
    const job = await db.project.findUnique({ where: { id }, select: { name: true } });
    jobs.set(id, job?.name ?? "Job");
  }

  const byId = new Map(documents.map((document) => [document.id, document]));
  const hits = new Map<string, SearchHit>();
  for (const row of rows) {
    const document = byId.get(row.documentId);
    if (!document) continue;
    if (document.libraryId && document.library?.deletedAt) continue;
    const where = document.projectId ? jobs.get(document.projectId) : (document.library?.name ?? "Library");
    if (!where) continue;
    const hit = hits.get(row.documentId) ?? {
      documentId: row.documentId,
      title: document.title,
      where,
      libraryId: document.libraryId,
      projectId: document.projectId,
      versionId: row.versionId,
      kind: documentKind(mimes.get(files.get(row.versionId) ?? "") ?? ""),
      pages: [],
    };
    if (hit.pages.length < 5) hit.pages.push({ page: row.page, sheetName: row.sheetName, snippet: row.snippet });
    hits.set(row.documentId, hit);
  }
  return [...hits.values()].slice(0, 50);
}

/** A PDF version's word boxes, read again if this render doesn't have them yet. */
async function wordsOf(versionId: string): Promise<PdfWord[][] | null> {
  const file = path.join(pagesDir(versionId), WORDS_FILE);
  try {
    return JSON.parse(await readFile(file, "utf8")) as PdfWord[][];
  } catch {
    if (!(await exists(pagesDir(versionId)))) return null;
    await extractText(versionId);
    return JSON.parse(await readFile(file, "utf8").catch(() => "null")) as PdfWord[][] | null;
  }
}

/** Find on page: every place the words appear in a PDF version, as boxes on its pages (fractions of the page). */
export async function findInVersion(versionId: string, query: string) {
  const words = await wordsOf(versionId);
  if (!words) return { matches: [], ready: false };
  return { matches: findWords(words.map((pageWords) => ({ words: pageWords })), query.slice(0, 200)), ready: true };
}
