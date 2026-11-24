"use client";

// Small pieces the materials screens (and the price book) share.
import { Package } from "lucide-react";
import { cn } from "@grid/ui";

/** A material as the browser gets it (MaterialRow from the service). */
export interface MaterialJson {
  id: string;
  name: string;
  itemType: string | null;
  brandId: string | null;
  brand: string | null;
  familyId: string | null;
  family: string | null;
  model: string | null;
  finish: string | null;
  size: string | null;
  link: string | null;
  trade: string;
  photoFileId: string | null;
  swatch: string | null;
  notes: string | null;
  removed: boolean;
}

export interface BrandJson {
  id: string;
  name: string;
  materials: number;
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

/** The material's picture: its photo, its colour swatch, or a plain box. */
export function MaterialPicture({ material, className }: { material: Pick<MaterialJson, "photoFileId" | "swatch">; className?: string }) {
  const box = cn("flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted", className);
  if (material.photoFileId) return <img src={photoUrl(material.photoFileId, "thumb")} alt="" className={cn(box, "object-cover")} />;
  // A colour picked by the business: shown as is, not a theme colour.
  if (material.swatch) return <span aria-hidden className={box} style={{ backgroundColor: material.swatch }} />;
  return (
    <span aria-hidden className={box}>
      <Package className="size-5 text-muted-foreground" />
    </span>
  );
}
