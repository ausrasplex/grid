"use client";

// The quote editor's take-off slot (phase 4c, docs/quotations-block.md
// "Take-off from plans"): lets the Markups Block show a quote's Take-off
// section (icon counts from the job's plans) and turn counts into lines,
// without Quotes knowing about plans. Markups adds a panel to the
// "quote.takeoff" slot (props: QuoteTakeoffPanelProps) and uses
// useQuoteTakeoff() inside it.

import { createContext, useContext, type ReactNode } from "react";

/** What the quote page passes to every "quote.takeoff" panel (plus ctx). */
export interface QuoteTakeoffPanelProps {
  quote: { id: string; number: string; title: string; projectId: string | null };
}

/** One line a take-off wants on the quote: a count of an icon and number, priced from its price book item. */
export interface TakeoffLine {
  /** "<icon key>#<number>": how the quote recognises the line later. */
  takeoffKey: string;
  qty: number;
  priceItemId: string;
}

export interface QuoteTakeoffValue {
  /** The quote can be changed (a draft) by this person. */
  editable: boolean;
  /** The job the take-off counts from (null until a take-off is started). */
  projectId: string | null;
  /** Take-off lines on the quote now: takeoffKey → qty. */
  onQuote: Record<string, number>;
  /** Makes the Quoting job if there's none, and returns the job to open the plans of. */
  start: () => Promise<string>;
  /** Adds each line (or updates the quantity of the one already there), priced from its item. */
  addLines: (lines: TakeoffLine[]) => Promise<void>;
  /** The quote's price book picker; resolves with the item picked, or null if closed. */
  chooseItem: () => Promise<{ id: string; name: string } | null>;
  /** Names of price book items, for showing what each number is linked to. */
  itemNames: (ids: string[]) => Promise<Record<string, string>>;
}

const QuoteTakeoffContext = createContext<QuoteTakeoffValue | null>(null);

export function QuoteTakeoffProvider({ value, children }: { value: QuoteTakeoffValue; children: ReactNode }) {
  return <QuoteTakeoffContext.Provider value={value}>{children}</QuoteTakeoffContext.Provider>;
}

/** The quote this take-off panel sits in. */
export function useQuoteTakeoff(): QuoteTakeoffValue {
  const value = useContext(QuoteTakeoffContext);
  if (!value) throw new Error("useQuoteTakeoff() must be used inside the quote editor");
  return value;
}
