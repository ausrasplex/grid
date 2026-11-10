// Reads a sheet number, title and revision from a drawing's file name
// ("E-101 Lighting Layout Rev C.pdf", "1234-ELE-DWG-E101[C].pdf") and,
// to fill gaps, from the text of its title block. Pure, so it's tested
// and the upload screen can show the same guesses.

export interface SheetGuess {
  number: string;
  title: string;
  revision: string;
  discipline: string;
}

export const DISCIPLINES: Record<string, string> = {
  E: "Electrical",
  M: "Mechanical",
  H: "Hydraulic",
  P: "Plumbing",
  F: "Fire",
  FP: "Fire",
  A: "Architectural",
  AR: "Architectural",
  S: "Structural",
  ST: "Structural",
  C: "Civil",
  CV: "Civil",
  L: "Landscape",
  LA: "Landscape",
  I: "Interiors",
  ID: "Interiors",
  G: "General",
  CO: "Communications",
  D: "Data",
  T: "Telecommunications",
  SE: "Security",
  AV: "Audio visual",
  V: "Vertical transport",
  K: "Kitchen",
  SK: "Sketches",
};

/** "Electrical" for "E", "Other" for anything unknown. */
export function disciplineName(code: string) {
  return DISCIPLINES[code] ?? (code ? code : "Other");
}

// Letters (1–3), an optional separator, digits, an optional ".digits" part
// and letter: E-101, E101, E1.01, EL-01, A-201a.
const NUMBER = /(?<![A-Z0-9])([A-Z]{1,3})[-. ]?(\d{1,4}(?:\.\d{1,3})?[A-Z]?)(?![A-Z0-9])/gi;
const REV_WORD = /\b(?:rev(?:ision)?)[\s._-]*([A-Z]{1,2}\d{0,2}|\d{1,3})\b/i;
const REV_BRACKET = /\[([A-Z]{1,2}\d{0,2}|\d{1,3})\]/i;
const REV_PAREN_END = /\(([A-Z]{1,2}\d{0,2}|\d{1,3})\)\s*$/i;
const SKIP_PREFIX = new Set(["REV", "NO", "SK", "DWG", "PG", "PAGE", "SHT", "SHEET", "LVL", "L", "LEVEL", "GF", "B"]);

/** The discipline code from a sheet number: "E-101" → "E", "FP03" → "FP". */
export function disciplineOf(number: string) {
  const match = /^([A-Z]{1,3})/i.exec(number.trim());
  if (!match) return "";
  const letters = match[1]!.toUpperCase();
  if (DISCIPLINES[letters]) return letters;
  if (DISCIPLINES[letters.slice(0, 2)]) return letters.slice(0, 2);
  if (DISCIPLINES[letters[0]!]) return letters[0]!;
  return "";
}

function tidy(text: string) {
  return text
    .replace(/[_]+/g, " ")
    .replace(/\s*[-–]\s*$/g, "")
    .replace(/^\s*[-–.,]\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Guesses from a file name. Anything not found is "". */
export function parseFileName(fileName: string): SheetGuess {
  let base = fileName.replace(/\.[a-z0-9]{2,4}$/i, "").trim();
  let revision = "";
  for (const pattern of [REV_WORD, REV_BRACKET, REV_PAREN_END]) {
    const match = pattern.exec(base);
    if (match) {
      revision = match[1]!.toUpperCase();
      base = (base.slice(0, match.index) + " " + base.slice(match.index + match[0].length)).trim();
      break;
    }
  }

  // The sheet number: the last candidate whose letters look like a discipline,
  // else the first candidate that isn't a level or a page.
  const candidates: { text: string; index: number; letters: string; digits: string }[] = [];
  for (const match of base.matchAll(NUMBER)) {
    candidates.push({ text: match[0], index: match.index!, letters: match[1]!.toUpperCase(), digits: match[2]! });
  }
  // "SK-E-01-P2": a short P/T/C/R number at the very end is the revision.
  const last = candidates.at(-1);
  if (!revision && last && candidates.length > 1 && /^[PTCR]$/.test(last.letters) && /^\d{1,2}$/.test(last.digits) && !base.slice(last.index + last.text.length).trim()) {
    revision = (last.letters + last.digits).toUpperCase();
    base = base.slice(0, last.index);
    candidates.pop();
  }
  const usable = candidates.filter((candidate) => !SKIP_PREFIX.has(candidate.letters));
  const known = usable.filter((candidate) => disciplineOf(candidate.letters));
  // "SK-01 Site sketch": a sketch number is fine when nothing better is there.
  const pick = known.at(-1) ?? usable[0] ?? candidates.find((candidate) => candidate.letters === "SK");
  let number = "";
  if (pick) {
    number = pick.text.toUpperCase().replace(" ", "-");
    base = base.slice(0, pick.index) + " " + base.slice(pick.index + pick.text.length);
    // A document number in front of it (1234-ELE-DWG-): not part of the title.
    const before = base.slice(0, pick.index);
    if (/^[\w-]*$/.test(before.trim()) && /[-_]$/.test(before.trim())) base = base.slice(pick.index);
  }

  // A bare revision after the number: "E101_C", "SK-E-01-P2".
  if (!revision && number) {
    const match = /^[\s_-]*([A-Z]|[PTCR]\d{1,2})(?=[\s_-]|$)/i.exec(base);
    if (match && (base.length === match[0].length || /[\s_-]/.test(base[match[0].length] ?? " "))) {
      revision = match[1]!.toUpperCase();
      base = base.slice(match[0].length);
    }
  }

  return { number, title: tidy(base), revision, discipline: disciplineOf(number) };
}

/** What a title block's text says (pdftotext -layout output). Best effort. */
export function parseTitleBlock(text: string): Partial<SheetGuess> {
  const out: Partial<SheetGuess> = {};
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+$/, ""));
  // The value after a label on the same line, or in the label's column on
  // the next lines (title blocks are often tables: "DRAWING NO.   REV").
  const find = (label: RegExp, pick: (text: string) => string | null) => {
    for (let index = 0; index < lines.length; index++) {
      const match = label.exec(lines[index]!);
      if (!match) continue;
      const rest = lines[index]!.slice(match.index + match[0].length).replace(/^[\s:.#-]+/, "");
      const inline = rest ? pick(rest.trim()) : null;
      if (inline) return inline;
      for (const next of lines.slice(index + 1, index + 4)) {
        if (!next.trim()) continue;
        const column = next.slice(match.index).trim() || next.trim();
        const value = pick(column) ?? pick(next.trim());
        if (value) return value;
        break;
      }
    }
    return null;
  };
  const firstToken = (text: string) => text.split(/\s{2,}|\s(?=[A-Z]{2,}\b)/)[0]!.trim();
  const number = find(/\b(?:drawing|dwg|sheet)\s*(?:no\.?|number|#)/i, (value) => {
    // The whole first value must be a sheet number ("SCALE 1:100 @ A1" isn't).
    const token = firstToken(value).split(/\s+/)[0] ?? "";
    const match = new RegExp(`^${NUMBER.source}$`, "i").exec(token);
    return match && !SKIP_PREFIX.has(match[1]!.toUpperCase()) ? match[0].toUpperCase() : null;
  });
  if (number) out.number = number;
  const revision = find(/\brev(?:ision)?\b\.?(?![\w])/i, (value) => {
    const match = /^([A-Z]{1,2}\d{0,2}|\d{1,3})$/i.exec(firstToken(value).split(/\s+/)[0] ?? "");
    return match ? match[1]!.toUpperCase() : null;
  });
  if (revision) out.revision = revision;
  const title = find(/\b(?:drawing\s+title|sheet\s+title|title)\b/i, (value) => {
    const candidate = value.replace(/\s{2,}.*$/, "").trim();
    return candidate.length > 3 && !/^(?:drawing|dwg|sheet|scale|date|rev|revision|drawn|checked|approved|project|job|client|status)\b/i.test(candidate) ? candidate.slice(0, 120) : null;
  });
  if (title) out.title = title;
  if (out.number) out.discipline = disciplineOf(out.number);
  return out;
}

/** File name first; the title block fills what the name didn't say. */
export function guessSheet(fileName: string, titleBlockText?: string | null, pageInFile = 1, pagesInFile = 1): SheetGuess {
  const fromName = parseFileName(fileName);
  const fromTitleBlock = titleBlockText ? parseTitleBlock(titleBlockText) : {};
  // In a multi-page set the file name names the set, so the title block wins.
  if (pagesInFile > 1) {
    const number = fromTitleBlock.number || (fromName.number ? `${fromName.number}-${pageInFile}` : `Sheet ${pageInFile}`);
    return { number, title: fromTitleBlock.title || fromName.title, revision: fromTitleBlock.revision || fromName.revision, discipline: fromTitleBlock.discipline || disciplineOf(number) || fromName.discipline };
  }
  // Same number both ways: the drawing's own spelling wins ("E103" → "E-103").
  const same = !!fromName.number && !!fromTitleBlock.number && fromName.number.replace(/[^A-Z0-9]/gi, "") === fromTitleBlock.number.replace(/[^A-Z0-9]/gi, "");
  const number = (same ? fromTitleBlock.number : fromName.number || fromTitleBlock.number) || "";
  return {
    number,
    title: fromName.title || fromTitleBlock.title || "",
    revision: fromName.revision || fromTitleBlock.revision || "",
    discipline: disciplineOf(number),
  };
}
