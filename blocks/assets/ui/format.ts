// Formatting helpers for the asset screens, with no "use client": server
// pages (ui/index.tsx) call them as well as the client components (through
// shared.tsx). A function from a "use client" file can't be called on the server.
import type { AssetStatus, CategoryField, FieldValue } from "./shared";

/** "Thu 26 Nov, 7:02 am". */
export const when = (at: string) => new Date(at).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export const photoUrl = (fileId: string, variant: "thumb" | "display" | "original" = "display") => `/api/files/${fileId}?v=${variant}`;

const STATUS_WORDS: Record<AssetStatus, string> = {
  IN_SERVICE: "In service",
  FAULTY: "Faulty",
  OUT_OF_SERVICE: "Do not use",
  IN_REPAIR: "In repair",
  RETIRED: "Retired",
  LOST: "Lost",
  OVERDUE: "Overdue",
};
export const statusWords = (status: AssetStatus) => STATUS_WORDS[status];

/** Warranty chips, as Docket's: running, ending within 90 days, ended. */
export const WARRANTY_TONE = { ok: "ok", soon: "soon", expired: "overdue", none: "none" } as const;

/** "$349.00". */
export const money = (amount: string | number | null) => (amount === null || amount === "" ? null : Number(amount).toLocaleString("en-AU", { style: "currency", currency: "AUD" }));

/** "3 Mar 2027" from "2027-03-03". */
export const dayText = (day: string | null) => (day ? new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null);

/** "3 Oct" from "2026-10-03" (the year only when it isn't this year). */
export function shortDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  const thisYear = date.getUTCFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", ...(thisYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

/** How a filled-in field reads. */
export function fieldText(field: CategoryField, value: FieldValue | undefined) {
  if (value === null || value === undefined || value === "") return null;
  if (field.type === "yesno") return value === true ? "Yes" : "No";
  if (field.type === "date") return new Date(`${value}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  return String(value);
}
