"use client";

// A job's plans: every sheet in set order, filter by discipline, search,
// and upload (one PDF per sheet, a whole set, or images). Uploads go
// through a review: Grid's guess at number, title and revision, and
// whether each is a new sheet or a new revision.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Upload } from "lucide-react";
import { ActionButton, Alert, Badge, Button, EmptyState, PageHeader, SearchInput, Sheet, SheetContent, Stack, api, cn } from "@grid/ui";
import { disciplineName } from "../parse";

export interface SheetRowJson {
  id: string;
  number: string;
  title: string;
  discipline: string;
  disciplineName: string;
  revisions: number;
  current: { id: string; revision: string; status: "PENDING" | "READY" | "FAILED"; error: string | null; createdAt: string } | null;
  newerExists: boolean;
  updatedAt: string;
}

interface PreviewRow {
  fileId: string;
  fileName: string;
  page: number;
  pages: number;
  number: string;
  title: string;
  revision: string;
  discipline: string;
  action: "new" | "revise" | "skip";
  sheetId: string | null;
  existing: { number: string; title: string; revision: string } | null;
  reason: string | null;
}

/** Uploads one file with progress (fetch can't report upload progress). */
function uploadFile(file: File, onProgress: (percent: number) => void): Promise<{ id: string }> {
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

export function PlansList({
  projectId,
  jobName,
  initial,
  canUpload,
}: {
  projectId: string;
  jobName: string;
  initial: SheetRowJson[];
  canUpload: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [discipline, setDiscipline] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [uploads, setUploads] = useState<{ name: string; pct: number; error?: string }[]>([]);
  const [review, setReview] = useState<PreviewRow[] | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => setRows(await api<SheetRowJson[]>(`/plans/job/${projectId}`)), [projectId]);

  // Keep checking while sheets are being prepared.
  const pending = rows.some((row) => row.current?.status === "PENDING");
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void reload().catch(() => {}), 3000);
    return () => clearInterval(timer);
  }, [pending, reload]);

  const disciplines = useMemo(() => {
    const countByDiscipline = new Map<string, number>();
    for (const row of rows) countByDiscipline.set(row.discipline, (countByDiscipline.get(row.discipline) ?? 0) + 1);
    return [...countByDiscipline];
  }, [rows]);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter((row) => (discipline === "ALL" || row.discipline === discipline) && words.every((word) => `${row.number} ${row.title}`.toLowerCase().includes(word)));

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setDone(null);
    const list = [...files];
    setUploads(list.map((item) => ({ name: item.name, pct: 0 })));
    const ids: string[] = [];
    for (let index = 0; index < list.length; index++) {
      try {
        const uploaded = await uploadFile(list[index]!, (percent) => setUploads((currentUploads) => currentUploads.map((upload, position) => (position === index ? { ...upload, percent } : upload))));
        ids.push(uploaded.id);
      } catch (error) {
        setUploads((currentUploads) => currentUploads.map((upload, position) => (position === index ? { ...upload, error: (error as Error).message } : upload)));
      }
    }
    if (input.current) input.current.value = "";
    if (!ids.length) return;
    setReading(true);
    try {
      setReview(await api<PreviewRow[]>(`/plans/job/${projectId}/preview`, { body: { fileIds: ids } }));
      setUploads((currentUploads) => currentUploads.filter((upload) => upload.error));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setReading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Plans"
        meta={
          <a href={`/b/projects/${projectId}`} className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="size-3.5" /> {jobName}
          </a>
        }
        actions={canUpload && <ActionButton icon={<Upload />} label="Upload" onClick={() => input.current?.click()} />}
      />
      <input ref={input} type="file" multiple hidden accept="application/pdf,.pdf,image/png,image/jpeg,image/webp" onChange={(event) => void pick(event.target.files)} aria-label="Plan files" />
      <Stack>
        {uploads.length > 0 && (
          <ul className="flex flex-col gap-2 rounded-xl border bg-card p-3" aria-label="Uploads">
            {uploads.map((upload, index) => (
              <li key={index} className="flex flex-col gap-1 text-sm">
                <span className="flex justify-between gap-2">
                  <span className="truncate">{upload.name}</span>
                  <span className={cn("shrink-0 tabular-nums", upload.error && "text-destructive")}>{upload.error ?? `${upload.pct}%`}</span>
                </span>
                {!upload.error && (
                  <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full bg-primary transition-[width]" style={{ width: `${upload.pct}%` }} />
                  </span>
                )}
              </li>
            ))}
            {reading && (
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Reading sheet numbers and revisions…
              </li>
            )}
          </ul>
        )}
        <Alert variant="error">{error}</Alert>
        <Alert variant="success">{done}</Alert>

        {rows.length > 0 && (
          <div className="flex flex-col gap-3">
            <SearchInput label="Search sheets" placeholder="Number or title" value={query} onChange={(event) => setQuery(event.target.value)} />
            {disciplines.length > 1 && (
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Discipline">
                {[["ALL", rows.length] as [string, number], ...disciplines].map(([code, count]) => (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={discipline === code}
                    onClick={() => setDiscipline(code)}
                    className={cn(
                      "min-h-touch shrink-0 rounded-full border px-4 text-sm font-semibold whitespace-nowrap",
                      discipline === code ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                    )}
                  >
                    {code === "ALL" ? "All" : disciplineName(code)} <span className="opacity-70">{count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState title="No plans yet">
            {canUpload ? (
              <>
                Upload the drawings for this job: PDFs from Procore, Aconex or email (one per sheet or a whole set), or photos of printed plans.
                <div className="mt-4">
                  <Button onClick={() => input.current?.click()}>
                    <Upload /> Upload plans
                  </Button>
                </div>
              </>
            ) : (
              "Nobody has uploaded plans for this job yet."
            )}
          </EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState title="No sheets match" />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((row) => (
              <li key={row.id}>
                <a href={`/b/plans/sheet/${row.id}`} className="group flex h-full flex-col overflow-hidden rounded-xl border bg-card hover:border-primary">
                  <span className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-white">
                    {row.current?.status === "READY" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/plans/tiles/${row.current.id}/thumb.jpg`} alt="" loading="lazy" className="h-full w-full object-contain" />
                    ) : row.current?.status === "FAILED" ? (
                      <span className="flex flex-col items-center gap-1 p-2 text-center text-xs text-destructive">
                        <AlertTriangle className="size-5" /> Couldn&apos;t read it
                      </span>
                    ) : (
                      <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" /> Preparing…
                      </span>
                    )}
                  </span>
                  <span className="flex flex-1 flex-col gap-0.5 border-t p-2.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-bold">{row.number}</span>
                      {row.current?.revision && <Badge variant="outline">Rev {row.current.revision}</Badge>}
                    </span>
                    <span className="line-clamp-2 text-sm text-muted-foreground">{row.title || row.disciplineName}</span>
                    {row.newerExists && <span className="text-xs font-semibold text-warning">Newer upload not current</span>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Stack>

      {review && (
        <ImportReview
          projectId={projectId}
          rows={review}
          onClose={() => setReview(null)}
          onDone={async (message) => {
            setReview(null);
            setDone(message);
            await reload();
          }}
        />
      )}
    </>
  );
}

function ImportReview({ projectId, rows: initial, onClose, onDone }: { projectId: string; rows: PreviewRow[]; onClose: () => void; onDone: (message: string) => void }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (index: number, patch: Partial<PreviewRow>) => setRows((currentRows) => currentRows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  const counts = { new: rows.filter((row) => row.action === "new").length, revise: rows.filter((row) => row.action === "revise").length };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent title="Check the sheets" description="Grid read these from the file names and title blocks. Fix anything that's wrong.">
        <div className="flex flex-col gap-3 px-2">
          <ul className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <li key={`${row.fileId}:${row.page}`} className={cn("flex flex-col gap-2 rounded-lg border p-3", row.action === "skip" && "opacity-60")}>
                <p className="truncate text-xs text-muted-foreground">
                  {row.fileName}
                  {row.pages > 1 && ` · page ${row.page} of ${row.pages}`}
                </p>
                <div className="grid grid-cols-[1fr_5rem] gap-2">
                  <label className="flex flex-col gap-1 text-xs font-semibold">
                    Sheet no.
                    <input
                      value={row.number}
                      onChange={(event) => set(index, { number: event.target.value })}
                      className="h-touch w-full min-w-0 rounded-md border border-input bg-card px-2 text-base font-bold"
                      aria-label={`Sheet number for ${row.fileName}${row.pages > 1 ? ` page ${row.page}` : ""}`}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold">
                    Rev
                    <input value={row.revision} onChange={(event) => set(index, { revision: event.target.value.toUpperCase() })} className="h-touch w-full min-w-0 rounded-md border border-input bg-card px-2 text-base" aria-label={`Revision for ${row.fileName}`} />
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Title
                  <input value={row.title} onChange={(event) => set(index, { title: event.target.value })} className="h-touch w-full min-w-0 rounded-md border border-input bg-card px-2 text-base" aria-label={`Title for ${row.fileName}`} />
                </label>
                <select
                  value={row.action}
                  onChange={(event) => set(index, { action: event.target.value as PreviewRow["action"] })}
                  className="h-touch rounded-md border border-input bg-card px-2 text-sm"
                  aria-label={`What to do with ${row.fileName}`}
                >
                  {row.sheetId ? (
                    <option value="revise">
                      New revision of {row.existing?.number}
                      {row.existing?.revision ? ` (now Rev ${row.existing.revision})` : ""}
                    </option>
                  ) : (
                    <option value="new">New sheet</option>
                  )}
                  <option value="skip">Skip</option>
                </select>
                {row.reason && <p className="text-xs text-muted-foreground">{row.reason}</p>}
              </li>
            ))}
          </ul>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="sticky bottom-0 flex flex-col gap-2 bg-background pt-2 pb-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={busy || (!counts.new && !counts.revise)}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const result = await api<{ newSheets: number; revisions: number; skipped: number }>(`/plans/job/${projectId}/import`, {
                    body: {
                      rows: rows.map((row) => ({
                        fileId: row.fileId,
                        page: row.page,
                        action: row.action,
                        sheetId: row.action === "revise" ? row.sheetId : null,
                        number: row.number,
                        title: row.title,
                        revision: row.revision,
                        discipline: row.discipline,
                        makeCurrent: true,
                      })),
                    },
                  });
                  const parts = [result.newSheets && `${result.newSheets} new sheet${result.newSheets === 1 ? "" : "s"}`, result.revisions && `${result.revisions} new revision${result.revisions === 1 ? "" : "s"}`].filter(Boolean);
                  onDone(`Added ${parts.join(" and ")}. They'll be ready to zoom in a moment.`);
                } catch (error) {
                  setError((error as Error).message);
                  setBusy(false);
                }
              }}
            >
              {busy ? "Adding…" : `Add ${[counts.new && `${counts.new} new`, counts.revise && `${counts.revise} revision${counts.revise === 1 ? "" : "s"}`].filter(Boolean).join(" + ") || "nothing"}`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
