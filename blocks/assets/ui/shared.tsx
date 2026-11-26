"use client";

// What the asset screens get from the server (service.ts), as JSON, and
// small pieces they share.
import { Wrench } from "lucide-react";
import { Badge, cn } from "@grid/ui";

export type FieldType = "text" | "number" | "date" | "yesno";
export interface CategoryField {
  key: string;
  label: string;
  type: FieldType;
}
export type FieldValue = string | number | boolean | null;
export type AssetStatus = "IN_SERVICE" | "FAULTY" | "OUT_OF_SERVICE" | "IN_REPAIR" | "RETIRED" | "LOST";

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

export interface CategoryJson {
  id: string;
  name: string;
  fields: CategoryField[];
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
};
export const statusWords = (status: AssetStatus) => STATUS_WORDS[status];

/** Nothing for gear in service; a chip for anything else. */
export function StatusBadge({ status }: { status: AssetStatus }) {
  if (status === "IN_SERVICE") return null;
  const urgent = status === "OUT_OF_SERVICE" || status === "LOST" || status === "FAULTY";
  return <Badge variant={urgent ? "destructive" : "secondary"}>{statusWords(status)}</Badge>;
}

/** "Makita DHP486 · SN 12345". */
export const assetMeta = (asset: Pick<AssetJson, "make" | "model" | "serial" | "category">, withCategory = true) =>
  [withCategory ? asset.category : null, [asset.make, asset.model].filter(Boolean).join(" ") || null, asset.serial ? `SN ${asset.serial}` : null].filter(Boolean).join(" · ");

/** How a filled-in field reads. */
export function fieldText(field: CategoryField, value: FieldValue | undefined) {
  if (value === null || value === undefined || value === "") return null;
  if (field.type === "yesno") return value === true ? "Yes" : "No";
  if (field.type === "date") return new Date(`${value}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  return String(value);
}
