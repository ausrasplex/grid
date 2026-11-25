// Bring in from plans and the accepted quote (docs/materials-block.md §2):
// adding up what other Blocks counted into one line per material, and
// comparing that with the job's list. Plain functions, no database, so the
// rules are tested (test/bring-in.test.ts).
//
//   - Plans: one line per material per level ("Plans now have 26, the
//     list has 24: Update?"). The room starts as the level's name when the
//     icons are on more than one level, else blank to fill in.
//   - Accepted quotes: one line per material per quote, room blank. Quote
//     lines the plans take-off made are left out when the plans are
//     brought in too (the plans give the same count, split by level).
//   - A line changed by hand (its quantity or material) is never updated or
//     removed; the room and note are yours and never touched.

export type BringSource = "PLANS" | "QUOTE";

/** A count from another Block, with its material worked out (null: not linked). */
export interface CountedRow {
  source: BringSource;
  label: string;
  levelId: string | null;
  groupId: string | null;
  materialId: string | null;
  qty: number;
  fromPlans?: boolean;
}

export interface IncomingLine {
  /** `${source}:${sourceRef}`. */
  key: string;
  source: BringSource;
  sourceRef: string;
  materialId: string;
  room: string | null;
  qty: number;
  /** What it was added up from ("Double GPO 2 (Iconic)", "Q-1001: …"). */
  from: string[];
}

export interface Unlinked {
  source: BringSource;
  label: string;
  qty: number;
}

export interface ExistingLine {
  id: string;
  source: "MANUAL" | BringSource;
  sourceRef: string | null;
  materialId: string;
  room: string | null;
  qty: number | null;
  editedByHand: boolean;
}

const round = (qty: number) => Math.round(qty * 1000) / 1000;

/** Adds rows up into lines. `levelName` names a level for the room. */
export function addUp(rows: CountedRow[], options: { plansBroughtIn: boolean; levelName: (levelId: string) => string | null }): { lines: IncomingLine[]; unlinked: Unlinked[] } {
  const kept = rows.filter((row) => row.qty > 0 && !(row.source === "QUOTE" && row.fromPlans && options.plansBroughtIn));
  const levels = new Set(kept.filter((row) => row.source === "PLANS").map((row) => row.levelId ?? ""));
  const lines = new Map<string, IncomingLine>();
  const unlinked = new Map<string, Unlinked>();
  for (const row of kept) {
    if (!row.materialId) {
      const key = `${row.source}:${row.label}`;
      const entry = unlinked.get(key) ?? { source: row.source, label: row.label, qty: 0 };
      entry.qty = round(entry.qty + row.qty);
      unlinked.set(key, entry);
      continue;
    }
    const sourceRef = row.source === "PLANS" ? `${row.levelId ?? "job"}:${row.materialId}` : `${row.groupId ?? "quote"}:${row.materialId}`;
    const key = `${row.source}:${sourceRef}`;
    const room = row.source === "PLANS" && levels.size > 1 && row.levelId ? options.levelName(row.levelId) : null;
    const line = lines.get(key) ?? { key, source: row.source, sourceRef, materialId: row.materialId, room, qty: 0, from: [] };
    line.qty = round(line.qty + row.qty);
    if (!line.from.includes(row.label)) line.from.push(row.label);
    lines.set(key, line);
  }
  return { lines: [...lines.values()], unlinked: [...unlinked.values()] };
}

export interface BringInPlan {
  /** New lines. */
  add: IncomingLine[];
  /** Lines whose count changed. */
  update: { line: ExistingLine; incoming: IncomingLine }[];
  /** Lines brought in before that the plans or quote no longer have. */
  remove: ExistingLine[];
  /** Changed by hand, so left alone even though the count is different (or gone). */
  kept: { line: ExistingLine; incoming: IncomingLine | null }[];
}

export const lineKey = (line: Pick<ExistingLine, "source" | "sourceRef">) => (line.source === "MANUAL" || !line.sourceRef ? null : `${line.source}:${line.sourceRef}`);

/** Compares the incoming lines with the list. Only the sources asked about are compared. */
export function planBringIn(incoming: IncomingLine[], existing: ExistingLine[], sources: BringSource[]): BringInPlan {
  const plan: BringInPlan = { add: [], update: [], remove: [], kept: [] };
  const byKey = new Map(incoming.map((line) => [line.key, line]));
  const seen = new Set<string>();
  for (const line of existing) {
    const key = lineKey(line);
    if (!key || line.source === "MANUAL" || !sources.includes(line.source)) continue;
    seen.add(key);
    const match = byKey.get(key) ?? null;
    if (match && line.qty !== null && round(line.qty) === match.qty) continue;
    if (line.editedByHand) plan.kept.push({ line, incoming: match });
    else if (match) plan.update.push({ line, incoming: match });
    else plan.remove.push(line);
  }
  for (const line of incoming) if (!seen.has(line.key)) plan.add.push(line);
  return plan;
}

/** The keys a plan offers to change: "add:<key>", "update:<id>", "remove:<id>". */
export function choiceKeys(plan: BringInPlan) {
  return [...plan.add.map((line) => `add:${line.key}`), ...plan.update.map(({ line }) => `update:${line.id}`), ...plan.remove.map((line) => `remove:${line.id}`)];
}
