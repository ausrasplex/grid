// Reading the words out of a PDF (docs/documents-block.md "Search"): every
// word on every page with where it sits, from poppler's pdftotext -bbox.
// The words make each page's text for search, and their boxes let the
// viewer highlight matches over the page pictures ("find on page").
// Scans (photos of paper) have no words: they need OCR, which is later.

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runTool } from "./pdf-pages.ts";

/** One word: its box as fractions of the page (0 → 1, left to right and top to bottom), then its text. */
export type PdfWord = [number, number, number, number, string];

export interface PdfPageWords {
  /** Page size in points (1/72 inch). */
  width: number;
  height: number;
  words: PdfWord[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
const round = (value: number) => Math.round(value * 10_000) / 10_000;

/** Reads pdftotext -bbox output (an HTML page per PDF page, a <word> per word). */
export function parseBbox(html: string): PdfPageWords[] {
  const pages: PdfPageWords[] = [];
  const pageMatcher = /<page\s+width="([\d.]+)"\s+height="([\d.]+)"\s*>([\s\S]*?)<\/page>/g;
  const wordMatcher = /<word\s+xMin="([-\d.]+)"\s+yMin="([-\d.]+)"\s+xMax="([-\d.]+)"\s+yMax="([-\d.]+)"\s*>([\s\S]*?)<\/word>/g;
  for (const page of html.matchAll(pageMatcher)) {
    const width = Number(page[1]) || 1;
    const height = Number(page[2]) || 1;
    const words: PdfWord[] = [];
    for (const word of page[3]!.matchAll(wordMatcher)) {
      const text = decode(word[5]!).trim();
      if (!text) continue;
      words.push([round(Number(word[1]) / width), round(Number(word[2]) / height), round(Number(word[3]) / width), round(Number(word[4]) / height), text]);
    }
    pages.push({ width, height, words });
  }
  return pages;
}

/** Every page's words, in page order (a page with none is a scan, or blank). */
export async function pdfWords(file: string, timeoutMs = 10 * 60_000): Promise<PdfPageWords[]> {
  const work = await mkdtemp(path.join(tmpdir(), "grid-text-"));
  try {
    const out = path.join(work, "words.html");
    await runTool("pdftotext", ["-bbox", "-enc", "UTF-8", file, out], timeoutMs);
    return parseBbox(await readFile(out, "utf8"));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** A page's text for search: its words, in reading order as pdftotext gives them. */
export const pageText = (page: PdfPageWords) => page.words.map((word) => word[4]).join(" ");

/** "RCBO-40A," → "rcbo40a": how words are compared when finding on a page. */
export const findForm = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Where `query` appears on the pages: each match's page (1-based) and the
 * boxes of its words. Words in the query must follow each other; the last
 * one may be the start of a word ("trip cur" finds "trip curve").
 */
export function findWords(pages: { words: PdfWord[] }[], query: string, limit = 500): { page: number; boxes: [number, number, number, number][] }[] {
  const terms = query.split(/\s+/).map(findForm).filter(Boolean);
  if (!terms.length) return [];
  const found: { page: number; boxes: [number, number, number, number][] }[] = [];
  pages.forEach((page, pageIndex) => {
    const forms = page.words.map((word) => findForm(word[4]));
    for (let start = 0; start < forms.length && found.length < limit; start++) {
      const matches = terms.every((term, offset) => {
        const form = forms[start + offset];
        if (form === undefined) return false;
        if (terms.length === 1) return form.includes(term);
        return offset === terms.length - 1 ? form.startsWith(term) : offset === 0 ? form.endsWith(term) : form === term;
      });
      if (!matches) continue;
      found.push({ page: pageIndex + 1, boxes: page.words.slice(start, start + terms.length).map((word) => [word[0], word[1], word[2], word[3]]) });
    }
  });
  return found;
}
