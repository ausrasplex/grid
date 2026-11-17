"use client";

// Pieces every Documents screen uses: uploading with progress, a document
// row, and filter chips.

import { useState, type ReactNode } from "react";
import { AlertTriangle, File, FileImage, FileSpreadsheet, FileText, Loader2, Presentation } from "lucide-react";
import { Scroller, cn } from "@grid/ui";
import { KIND_LABEL, type DocumentKind } from "../kinds";

export interface DocumentRowJson {
  id: string;
  title: string;
  libraryId: string | null;
  libraryName: string | null;
  projectId: string | null;
  folderId: string | null;
  manufacturer: string;
  models: string[];
  tags: string[];
  kind: DocumentKind;
  pages: number;
  status: "PENDING" | "READY" | "FAILED";
  versions: number;
  thumb: string | null;
  updatedAt: string;
}

/** Uploads one file with progress (fetch can't report upload progress). */
export function uploadFile(file: File, onProgress: (percent: number) => void): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/files");
    request.upload.onprogress = (event) => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100));
    request.onload = () => {
      let data: { id?: string; error?: { message?: string } } = {};
      try {
        data = JSON.parse(request.responseText);
      } catch {
        /* not JSON */
      }
      if (request.status >= 200 && request.status < 300 && data.id) resolve({ id: data.id });
      else reject(new Error(data.error?.message ?? `Upload failed (${request.status})`));
    };
    request.onerror = () => reject(new Error("Upload failed: check your connection"));
    const form = new FormData();
    form.append("file", file);
    request.send(form);
  });
}

export interface UploadState {
  name: string;
  percent: number;
  error?: string;
}

/** Uploads several files one after another; returns the ids that made it. */
export function useUploads() {
  const [uploads, setUploads] = useState<UploadState[]>([]);
  async function uploadAll(files: File[]): Promise<string[]> {
    setUploads(files.map((file) => ({ name: file.name, percent: 0 })));
    const ids: string[] = [];
    for (const [index, file] of files.entries()) {
      const update = (patch: Partial<UploadState>) => setUploads((current) => current.map((upload, position) => (position === index ? { ...upload, ...patch } : upload)));
      try {
        ids.push((await uploadFile(file, (percent) => update({ percent }))).id);
        update({ percent: 100 });
      } catch (error) {
        update({ error: (error as Error).message });
      }
    }
    return ids;
  }
  const clearDone = () => setUploads((current) => current.filter((upload) => upload.error));
  return { uploads, uploadAll, clearDone, clear: () => setUploads([]) };
}

export function UploadList({ uploads, working }: { uploads: UploadState[]; working?: string | null }) {
  if (!uploads.length && !working) return null;
  return (
    <ul className="flex flex-col gap-2 rounded-xl border bg-card p-3" aria-label="Uploads">
      {uploads.map((upload, index) => (
        <li key={index} className="flex flex-col gap-1 text-sm">
          <span className="flex justify-between gap-2">
            <span className="truncate">{upload.name}</span>
            <span className={cn("shrink-0 tabular-nums", upload.error && "text-destructive")}>{upload.error ?? `${upload.percent}%`}</span>
          </span>
          {!upload.error && (
            <span className="h-1.5 overflow-hidden rounded-full bg-muted">
              <span className="block h-full bg-primary transition-[width]" style={{ width: `${upload.percent}%` }} />
            </span>
          )}
        </li>
      ))}
      {working && (
        <li className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {working}
        </li>
      )}
    </ul>
  );
}

const KIND_ICON: Record<DocumentKind, typeof File> = {
  pdf: FileText,
  image: FileImage,
  word: FileText,
  spreadsheet: FileSpreadsheet,
  slides: Presentation,
  text: FileText,
  other: File,
};

export function KindIcon({ kind, className }: { kind: DocumentKind; className?: string }) {
  const Icon = KIND_ICON[kind];
  return <Icon aria-hidden className={className} />;
}

const day = (date: string) => new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

/** "PDF · 24 pages · 3 versions · 12 Nov 2026" */
export function documentMeta(row: DocumentRowJson, extra?: string | null) {
  return [
    extra,
    KIND_LABEL[row.kind],
    row.kind === "pdf" && row.pages ? `${row.pages} page${row.pages === 1 ? "" : "s"}` : null,
    row.versions > 1 ? `${row.versions} versions` : null,
    day(row.updatedAt),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** One document in a list: a little picture of it, its title and details. */
export function DocumentLink({ row, meta, badge, after }: { row: DocumentRowJson; meta?: string | null; badge?: ReactNode; after?: ReactNode }) {
  return (
    <li className="flex items-center">
      <a href={`/documents/doc/${row.id}`} className="flex min-h-touch-lg min-w-0 flex-1 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted active:bg-muted sm:px-5">
        <span className="paper flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white text-neutral-500">
          {row.status === "PENDING" ? (
            <Loader2 aria-label="Getting it ready" className="size-5 animate-spin" />
          ) : row.status === "FAILED" ? (
            <AlertTriangle aria-label="Couldn't read it" className="size-5 text-destructive" />
          ) : row.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.thumb} alt="" loading="lazy" className="size-full object-cover object-top" />
          ) : (
            <KindIcon kind={row.kind} className="size-6" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">{row.title}</span>
            {badge}
          </span>
          <span className="block truncate text-sm text-muted-foreground">{documentMeta(row, meta)}</span>
        </span>
      </a>
      {after}
    </li>
  );
}

/** A row of filter chips that scrolls sideways on phones. */
export function Chips<T extends string>({ label, items, value, onChange }: { label: string; items: { value: T; label: string; count?: number }[]; value: T; onChange: (value: T) => void }) {
  return (
    <Scroller axis="x" className="-mx-4 flex gap-2 px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={value === item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            "min-h-touch shrink-0 rounded-full border px-4 text-sm font-semibold whitespace-nowrap",
            value === item.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
          )}
        >
          {item.label} {item.count !== undefined && <span className="opacity-70">{item.count}</span>}
        </button>
      ))}
    </Scroller>
  );
}

/** Words typed in a search box all have to appear somewhere in the document's details. */
export function matches(row: DocumentRowJson, query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = [row.title, row.manufacturer, ...row.models, ...row.tags, row.libraryName ?? ""].join(" ").toLowerCase();
  return words.every((word) => text.includes(word));
}
