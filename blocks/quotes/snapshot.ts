// What a sent quote looks like, frozen (QuoteRevision.snapshot), and its
// totals once the customer picks optional extras. No imports beyond the
// money maths, so it runs the same on the customer's phone and the server.

import { calculate, type Totals } from "./money.ts";

export interface QuoteSnapshot {
  number: string;
  revision: string | null;
  title: string;
  date: string;
  validUntil: string;
  client: { name: string; contactName: string | null; email: string | null; phone: string | null; address: string | null; abn: string | null } | null;
  siteAddress: string | null;
  clientView: "ITEMISED" | "SECTIONS" | "LUMP";
  intro: string | null;
  terms: string | null;
  lines: {
    section: string | null;
    description: string;
    qty: number;
    unit: string;
    unitCents: number;
    amountCents: number;
    taxLabel: string;
    /** 0.1 for 10%. Missing in quotes sent before 3b (worked out from taxByCode). */
    taxRate?: number;
    optional: boolean;
  }[];
  totals: { subtotalExCents: number; taxCents: number; totalCents: number; optionsIncCents: number; taxByCode: { label: string; rate: number; taxCents: number }[] };
  tax: {
    taxName: string;
    pricesIncludeTax: boolean;
    /** Missing before 3b: "LINE". */
    rounding?: "LINE" | "TOTAL";
    currency: string;
    locale: string;
    registrationLabel: string;
    registrationNumber: string | null;
    documentTitle: string;
  };
  preparedBy: { name: string; email: string };
  /** Sent with a link to accept and sign online (3b). */
  acceptOnline?: boolean;
}

/** The indexes of a snapshot's optional lines. */
export const optionIndexes = (snapshot: QuoteSnapshot) => snapshot.lines.flatMap((line, index) => (line.optional ? [index] : []));

/** Totals with the chosen optional extras (line indexes) included. */
export function totalsFor(snapshot: QuoteSnapshot, chosen: number[]): Totals {
  const rateOf = (line: QuoteSnapshot["lines"][number]) => line.taxRate ?? snapshot.totals.taxByCode.find((code) => code.label === line.taxLabel)?.rate ?? 0;
  const codes = new Map<string, { id: string; label: string; rate: number }>();
  const lines = snapshot.lines.map((line, index) => {
    const rate = rateOf(line);
    const id = `${line.taxLabel}|${rate}`;
    if (!codes.has(id)) codes.set(id, { id, label: line.taxLabel, rate });
    return { qty: line.qty, unitCents: line.unitCents, taxCodeId: id, optional: line.optional, chosen: line.optional && chosen.includes(index) };
  });
  return calculate(lines, { pricesIncludeTax: snapshot.tax.pricesIncludeTax, rounding: snapshot.tax.rounding ?? "LINE", codes: [...codes.values()] });
}
