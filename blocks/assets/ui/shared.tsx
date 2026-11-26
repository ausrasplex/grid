"use client";

// What the asset screens get from the server (service.ts), as JSON, and
// small pieces they share.
import type { ReactNode } from "react";
import { Wrench } from "lucide-react";
import { Badge, Label, cn } from "@grid/ui";

export type FieldType = "text" | "number" | "date" | "yesno";
export interface CategoryField {
  key: string;
  label: string;
  type: FieldType;
}
export type FieldValue = string | number | boolean | null;
export type AssetStatus = "IN_SERVICE" | "FAULTY" | "OUT_OF_SERVICE" | "IN_REPAIR" | "RETIRED" | "LOST" | "OVERDUE";

export interface AssetJson {
  id: string;
  number: number;
  name: string;
  categoryId: string | null;
  category: string | null;
  make: string | null;
  model: string | null;
  serial: string | null;
  purchasedOn: string | null;
  photoFileIds: string[];
  notes: string | null;
  fields: Record<string, FieldValue>;
  status: AssetStatus;
  tagCode: string;
  barcode: string | null;
  holder: HolderJson;
  /** The most urgent routine, when one's due soon or overdue. */
  due: DueJson | null;
  serviceEnabled: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HolderJson {
  kind: "STORE" | "PROJECT" | "USER" | "VEHICLE" | "ASSET";
  userId: string | null;
  userName: string | null;
  projectId: string | null;
  buildingId: string | null;
  levelId: string | null;
  place: string | null;
  text: string;
  since: string | null;
}

export interface MoveJson {
  id: string;
  move: "CHECK_OUT" | "RETURN" | "TAKE_OVER" | "MOVE";
  holder: HolderJson;
  by: string;
  note: string | null;
  at: string;
  until: string | null;
}

/** "Tue 3 Mar, 7:02 am". */
export const when = (at: string) => new Date(at).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export interface CategoryRoutineJson {
  id: string;
  name: string;
  everyMonths: number | null;
  mustPass: boolean;
  notes: string | null;
  interval: string;
}

export interface CategoryJson {
  id: string;
  name: string;
  fields: CategoryField[];
  routines: CategoryRoutineJson[];
  count: number;
}

export const photoUrl = (fileId: string, variant: "thumb" | "display" | "original" = "display") => `/api/files/${fileId}?v=${variant}`;

/** Sends a photo to /api/files; returns its id. */
export async function uploadPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/files", { method: "POST", body: form, credentials: "same-origin" });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.id) throw new Error(body?.error?.message ?? "Couldn't upload the photo");
  return body.id as string;
}

export function AssetPicture({ asset, className }: { asset: Pick<AssetJson, "photoFileIds">; className?: string }) {
  const box = cn("flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted", className);
  const photo = asset.photoFileIds[0];
  // eslint-disable-next-line @next/next/no-img-element
  if (photo) return <img src={photoUrl(photo, "thumb")} alt="" className={cn(box, "object-cover")} />;
  return (
    <span aria-hidden className={box}>
      <Wrench className="size-5 text-muted-foreground" />
    </span>
  );
}

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

/** Nothing for gear in service; a chip for anything else. */
export function StatusBadge({ status }: { status: AssetStatus }) {
  if (status === "IN_SERVICE") return null;
  const urgent = status === "OUT_OF_SERVICE" || status === "LOST" || status === "FAULTY" || status === "OVERDUE";
  return <Badge variant={urgent ? "destructive" : "secondary"}>{statusWords(status)}</Badge>;
}

/** "Makita DHP486 · SN 12345". */
export const assetMeta = (asset: Pick<AssetJson, "make" | "model" | "serial" | "category">, withCategory = true) =>
  [withCategory ? asset.category : null, [asset.make, asset.model].filter(Boolean).join(" ") || null, asset.serial ? `SN ${asset.serial}` : null].filter(Boolean).join(" · ");

export type DueTone = "ok" | "soon" | "overdue" | "none";
export interface DueJson {
  tone: DueTone;
  text: string;
  dueOn: string | null;
}

/** Chip colours, as Docket's: fine, coming up, late, nothing set. */
export const TONE: Record<DueTone | "plain", string> = {
  ok: "bg-success/15 text-success",
  soon: "bg-warning/20 text-foreground",
  overdue: "bg-destructive/15 text-destructive",
  none: "bg-muted text-muted-foreground",
  plain: "bg-muted text-foreground",
};

/** A small rounded label on a card or row (Docket's chips): "Test & tag: Due in 12 days", "3 pieces". */
export function Chip({ tone = "plain", className, children, title }: { tone?: keyof typeof TONE; className?: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold [&_svg]:size-3.5", TONE[tone], className)}>
      {children}
    </span>
  );
}

/** A round pick-one-or-more button ("Routines covered", "For"): filled when on. */
export function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex min-h-touch items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors [&_svg]:size-4",
        on ? "bg-primary text-primary-foreground" : "border border-input bg-card hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/** A labelled box for longer text (notes). */
export function TextArea({ id, label, value, onChange, rows = 3, placeholder, hint }: { id: string; label: string; value: string; onChange: (value: string) => void; rows?: number; placeholder?: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-2 lg:max-w-2xl">
      <Label htmlFor={id}>{label}</Label>
      <textarea id={id} rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-input bg-card px-3 py-2 text-base" />
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A small heading inside a form or card ("Make and model", "Routines"). */
export function SubHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 pt-2">
      <h3 className="text-base font-bold">{title}</h3>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** "3 Mar 2027" from "2027-03-03". */
export const dayText = (day: string | null) => (day ? new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null);

/** Today's date as "2026-11-26", on this phone. */
export const todayHere = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** How a filled-in field reads. */
export function fieldText(field: CategoryField, value: FieldValue | undefined) {
  if (value === null || value === undefined || value === "") return null;
  if (field.type === "yesno") return value === true ? "Yes" : "No";
  if (field.type === "date") return new Date(`${value}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  return String(value);
}
