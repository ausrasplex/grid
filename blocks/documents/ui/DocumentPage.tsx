"use client";

// One document: the viewer for the current version (or an older one), and
// its actions: download, upload a new version, details, versions, pin to a
// job, delete.

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Download, Loader2, MoreHorizontal, Upload } from "lucide-react";
import { ActionButton, Alert, Badge, Button, Field, FormActions, Label, List, ListRow, PageHeader, SelectField, Sheet, SheetContent, Stack, Switch, api, formatBytes, useAction } from "@grid/ui";
import { KIND_LABEL, UPLOAD_ACCEPT, type DocumentKind } from "../kinds";
import { PageViewer } from "@grid/ui";
import { SheetViewer } from "./SheetViewer";
import type { SheetSummary } from "../sheets";
import { KindIcon, UploadList, useUploads } from "./shared";

export interface VersionJson {
  id: string;
  status: "PENDING" | "READY" | "FAILED";
  error: string | null;
  pages: number;
  pageSizes: [number, number][];
  /** Spreadsheets: each sheet's name, size and header row. */
  sheets: SheetSummary[];
  fileId: string;
  fileName: string | null;
  kind: DocumentKind;
  size: number;
  note: string | null;
  createdAt: string;
  uploadedBy: string;
}

export interface DocumentJson {
  id: string;
  title: string;
  description: string;
  manufacturer: string;
  models: string[];
  productType: string;
  tags: string[];
  allowDownload: boolean;
  availableOffline: boolean;
  library: { id: string; name: string } | null;
  job: { id: string; name: string } | null;
  folder: { id: string; name: string } | null;
  links: { id: string; projectId: string; jobName: string }[];
  currentVersionId: string | null;
  versions: VersionJson[];
}

export interface DocumentPermissions {
  upload: boolean;
  edit: boolean;
  delete: boolean;
}

const day = (date: string) => new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function DocumentPage({
  initial,
  versionId,
  libraries,
  folders,
  permissions,
  deletedDays,
}: {
  initial: DocumentJson;
  /** An older version to show instead of the current one. */
  versionId: string | null;
  libraries: { id: string; name: string }[];
  folders: { id: string; name: string }[];
  permissions: DocumentPermissions;
  deletedDays: number;
}) {
  const [document, setDocument] = useState(initial);
  const [sheet, setSheet] = useState<"menu" | "details" | "versions" | "pin" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const { uploads, uploadAll, clear } = useUploads();
  const action = useAction();
  const input = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => setDocument(await api<DocumentJson>(`/documents/doc/${initial.id}`)), [initial.id]);
  const shownId = versionId ?? document.currentVersionId;
  const version = document.versions.find((entry) => entry.id === shownId) ?? document.versions[0] ?? null;
  const isCurrent = !!version && version.id === document.currentVersionId;

  // Check back while the pages are being made.
  useEffect(() => {
    if (version?.status !== "PENDING") return;
    const timer = setInterval(() => void reload().catch(() => {}), 3000);
    return () => clearInterval(timer);
  }, [version?.status, reload]);

  const back = document.library ? { href: `/documents/library/${document.library.id}`, label: document.library.name } : document.job ? { href: `/documents/job/${document.job.id}`, label: document.job.name } : { href: "/documents", label: "Documents" };
  const canDownload = document.allowDownload || permissions.edit;

  async function newVersion(files: FileList | null) {
    if (!files?.length) return;
    setDone(null);
    await action.run(async () => {
      const [fileId] = await uploadAll([files[0]!]);
      if (input.current) input.current.value = "";
      if (!fileId) return;
      await api(`/documents/doc/${document.id}/versions`, { body: { fileId } });
      clear();
      await reload();
      setDone("New version added. It's the current one now; the old one is under Versions.");
      if (versionId) window.location.href = `/documents/doc/${document.id}`;
    });
  }

  return (
    <>
      <PageHeader
        title={document.title}
        meta={
          <span className="flex flex-wrap items-center gap-x-2">
            <a href={back.href} className="inline-flex items-center gap-1 hover:underline">
              <ArrowLeft className="size-3.5" /> {back.label}
            </a>
            {document.folder && <span>· {document.folder.name}</span>}
            {version && <span>· {KIND_LABEL[version.kind]}{version.kind === "pdf" && version.pages ? ` · ${version.pages} page${version.pages === 1 ? "" : "s"}` : ""}{version.kind === "spreadsheet" && version.sheets.length > 1 ? ` · ${version.sheets.length} sheets` : ""}</span>}
          </span>
        }
        actions={
          <>
            {canDownload && version && (
              <a
                href={`/api/files/${version.fileId}?v=original&download=1`}
                aria-label="Download"
                title="Download"
                className="flex size-touch items-center justify-center rounded-(--radius-button) border border-input bg-card hover:bg-muted sm:w-auto sm:gap-2 sm:px-4 sm:font-semibold"
              >
                <Download className="size-5" /> <span className="hidden sm:inline">Download</span>
              </a>
            )}
            <ActionButton icon={<MoreHorizontal />} label="More" variant="outline" onClick={() => setSheet("menu")} />
          </>
        }
      />
      <input ref={input} type="file" hidden accept={UPLOAD_ACCEPT} onChange={(event) => void newVersion(event.target.files)} aria-label="New version" />
      <Stack>
        <UploadList uploads={uploads} working={action.busy && !uploads.length ? "Saving…" : null} />
        <Alert variant="error">{action.error}</Alert>
        <Alert variant="success">{done}</Alert>
        {version && !isCurrent && (
          <Alert>
            You&apos;re looking at an older version, from {day(version.createdAt)}.{" "}
            <a href={`/documents/doc/${document.id}`} className="font-semibold underline">
              See the current one
            </a>
          </Alert>
        )}
        {document.description && <p className="text-sm whitespace-pre-line text-muted-foreground">{document.description}</p>}
        {version ? <VersionView key={version.id} version={version} title={document.title} canDownload={canDownload} canRetry={permissions.upload} canEdit={permissions.edit} onRetried={reload} /> : <Alert variant="error">This document has no file.</Alert>}
      </Stack>

      <Sheet open={sheet === "menu"} onOpenChange={(open) => !open && setSheet(null)}>
        <SheetContent title={document.title} desktop="dialog">
          <ul className="flex flex-col gap-2 px-4 pb-4">
            {permissions.upload && (
              <MenuButton
                onClick={() => {
                  setSheet(null);
                  input.current?.click();
                }}
              >
                <Upload /> Upload a new version
              </MenuButton>
            )}
            <MenuButton onClick={() => setSheet("versions")}>Versions ({document.versions.length})</MenuButton>
            {permissions.edit && <MenuButton onClick={() => setSheet("details")}>Details</MenuButton>}
            {permissions.edit && document.library && <MenuButton onClick={() => setSheet("pin")}>Pin to a job{document.links.length ? ` (on ${document.links.length})` : ""}</MenuButton>}
            {permissions.delete && (
              <MenuButton
                destructive
                onClick={() =>
                  void action.run(async () => {
                    if (!window.confirm(`Delete “${document.title}”? It goes to Recently deleted (Settings › Storage) for ${deletedDays} days, so it can be put back.`)) return;
                    await api(`/documents/doc/${document.id}`, { method: "DELETE" });
                    window.location.href = back.href;
                  })
                }
              >
                Delete
              </MenuButton>
            )}
          </ul>
        </SheetContent>
      </Sheet>

      {sheet === "details" && <DetailsSheet document={document} libraries={libraries} folders={folders} onClose={() => setSheet(null)} onSaved={reload} />}
      {sheet === "versions" && <VersionsSheet document={document} shownId={version?.id ?? null} canEdit={permissions.edit} onClose={() => setSheet(null)} onSaved={reload} />}
      {sheet === "pin" && <PinSheet document={document} onClose={() => setSheet(null)} onSaved={reload} />}
    </>
  );
}

function MenuButton({ onClick, destructive, children }: { onClick: () => void; destructive?: boolean; children: React.ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex min-h-touch-lg w-full items-center gap-3 rounded-lg bg-muted px-4 text-left font-semibold hover:bg-[color-mix(in_srgb,var(--foreground)_7%,var(--muted))] [&_svg]:size-5 ${destructive ? "text-destructive" : ""}`}
      >
        {children}
      </button>
    </li>
  );
}

function VersionView({
  version,
  title,
  canDownload,
  canRetry,
  canEdit,
  onRetried,
}: {
  version: VersionJson;
  title: string;
  canDownload: boolean;
  canRetry: boolean;
  canEdit: boolean;
  onRetried: () => Promise<void>;
}) {
  const action = useAction();
  if (version.kind === "pdf" || (version.kind === "spreadsheet" && (version.status !== "READY" || version.sheets.length))) {
    const spreadsheet = version.kind === "spreadsheet";
    if (version.status === "PENDING")
      return (
        <div className="flex flex-col items-center gap-2 rounded-xl border bg-card px-4 py-12 text-center text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
          {spreadsheet ? "Getting the spreadsheet ready. A big one can take a minute." : "Getting the pages ready. A long manual can take a minute."}
        </div>
      );
    if (version.status === "FAILED")
      return (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-10 text-center">
          <AlertTriangle className="size-6 text-destructive" />
          <p>
            Grid couldn&apos;t read this {spreadsheet ? "spreadsheet" : "PDF"}
            {version.error ? `: ${version.error}` : "."}
          </p>
          <Alert variant="error">{action.error}</Alert>
          {canRetry && (
            <Button
              variant="outline"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await api(`/documents/version/${version.id}/retry`, { method: "POST" });
                  await onRetried();
                })
              }
            >
              Try again
            </Button>
          )}
        </div>
      );
    if (spreadsheet) return <SheetViewer versionId={version.id} summaries={version.sheets} canEdit={canEdit} />;
    return <PageViewer title={title} pages={version.pageSizes.map(([width, height], index) => ({ src: `/api/documents/pages/${version.id}/p${index + 1}.jpg?w=${width}`, width, height }))} />;
  }
  if (version.kind === "image") return <PageViewer title={title} pages={[{ src: `/api/files/${version.fileId}?v=display`, width: 0, height: 0 }]} />;
  const later = version.kind === "word" ? "Opening Word files in Grid is coming." : null;
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-10 text-center">
      <KindIcon kind={version.kind} className="size-10 text-muted-foreground" />
      <p className="font-semibold">{version.fileName ?? title}</p>
      <p className="text-sm text-muted-foreground">
        {KIND_LABEL[version.kind]} · {formatBytes(version.size)}. {later} {canDownload ? "Download it to open it on this device." : "This one can't be downloaded."}
      </p>
      {canDownload && (
        <Button asChild>
          <a href={`/api/files/${version.fileId}?v=original&download=1`}>
            <Download /> Download
          </a>
        </Button>
      )}
    </div>
  );
}

const listText = (list: string[]) => list.join(", ");
const textList = (text: string) => text.split(",").map((word) => word.trim()).filter(Boolean);

function DetailsSheet({
  document,
  libraries,
  folders,
  onClose,
  onSaved,
}: {
  document: DocumentJson;
  libraries: { id: string; name: string }[];
  folders: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    title: document.title,
    description: document.description,
    manufacturer: document.manufacturer,
    models: listText(document.models),
    productType: document.productType,
    tags: listText(document.tags),
    libraryId: document.library?.id ?? "",
    folderId: document.folder?.id ?? "",
    allowDownload: document.allowDownload,
  });
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const action = useAction();
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent title="Details" description="Manufacturer, models and tags help people find it." desktop="dialog">
        <form
          className="flex flex-col gap-4 px-4 pb-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await api(`/documents/doc/${document.id}`, {
                method: "PATCH",
                body: {
                  title: form.title,
                  description: form.description,
                  manufacturer: form.manufacturer,
                  models: textList(form.models),
                  productType: form.productType,
                  tags: textList(form.tags),
                  allowDownload: form.allowDownload,
                  ...(document.library ? { libraryId: form.libraryId } : { folderId: form.folderId || null }),
                },
              });
              await onSaved();
              onClose();
            });
          }}
        >
          <Field label="Title" value={form.title} onChange={(event) => set({ title: event.target.value })} required maxLength={160} />
          {document.library ? (
            <SelectField label="Library" value={form.libraryId} onChange={(event) => set({ libraryId: event.target.value })} options={libraries.map((library) => ({ value: library.id, label: library.name }))} />
          ) : (
            <SelectField label="Folder" value={form.folderId} onChange={(event) => set({ folderId: event.target.value })} options={[...folders.map((folder) => ({ value: folder.id, label: folder.name })), { value: "", label: "Not in a folder" }]} />
          )}
          <Field label="Manufacturer" value={form.manufacturer} onChange={(event) => set({ manufacturer: event.target.value })} maxLength={80} placeholder="e.g. Clipsal" />
          <Field label="Model numbers" hint="Separate them with commas" value={form.models} onChange={(event) => set({ models: event.target.value })} placeholder="e.g. RT-200, RT-210" />
          <Field label="Product type" value={form.productType} onChange={(event) => set({ productType: event.target.value })} maxLength={80} placeholder="e.g. Thermostat" />
          <Field label="Tags" hint="Separate them with commas" value={form.tags} onChange={(event) => set({ tags: event.target.value })} placeholder="e.g. BMS, Level 2" />
          <div className="flex flex-col gap-2 lg:max-w-2xl">
            <Label htmlFor="document-description">Description</Label>
            <textarea
              id="document-description"
              value={form.description}
              onChange={(event) => set({ description: event.target.value })}
              maxLength={2000}
              rows={3}
              className="min-h-24 rounded-md border border-input bg-card px-3 py-2 text-base"
            />
          </div>
          <label className="flex min-h-touch items-center justify-between gap-4">
            <span>
              <span className="block font-semibold">Allow download</span>
              <span className="block text-sm text-muted-foreground">Off: people can only read it in Grid.</span>
            </span>
            <Switch checked={form.allowDownload} onCheckedChange={(checked) => set({ allowDownload: checked })} />
          </label>
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={action.busy}>
              Save
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function VersionsSheet({ document, shownId, canEdit, onClose, onSaved }: { document: DocumentJson; shownId: string | null; canEdit: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const action = useAction();
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent title="Versions" description="Newest first. Every version stays readable." desktop="dialog">
        <div className="flex flex-col gap-2 pb-4">
          <div className="px-4">
            <Alert variant="error">{action.error}</Alert>
          </div>
          <List>
            {document.versions.map((version) => {
              const current = version.id === document.currentVersionId;
              return (
                <ListRow
                  key={version.id}
                  title={day(version.createdAt)}
                  badges={
                    <>
                      {current && <Badge variant="default">Current</Badge>}
                      {version.id === shownId && !current && <Badge>Showing</Badge>}
                      {version.status === "FAILED" && <Badge variant="destructive">Couldn&apos;t read</Badge>}
                    </>
                  }
                  meta={[version.uploadedBy, version.fileName, formatBytes(version.size), version.note].filter(Boolean).join(" · ")}
                  actions={
                    <>
                      {version.id !== shownId && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={current ? `/documents/doc/${document.id}` : `/documents/doc/${document.id}/${version.id}`}>View</a>
                        </Button>
                      )}
                      {canEdit && !current && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={action.busy}
                          onClick={() =>
                            void action.run(async () => {
                              await api(`/documents/doc/${document.id}/current`, { body: { versionId: version.id } });
                              await onSaved();
                            })
                          }
                        >
                          Make current
                        </Button>
                      )}
                      {canEdit && document.versions.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={action.busy}
                          onClick={() =>
                            void action.run(async () => {
                              if (!window.confirm(`Remove the version from ${day(version.createdAt)}? Its file is deleted straight away.`)) return;
                              await api(`/documents/version/${version.id}`, { method: "DELETE" });
                              if (version.id === shownId) window.location.href = `/documents/doc/${document.id}`;
                              else await onSaved();
                            })
                          }
                        >
                          Remove
                        </Button>
                      )}
                    </>
                  }
                />
              );
            })}
          </List>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PinSheet({ document, onClose, onSaved }: { document: DocumentJson; onClose: () => void; onSaved: () => Promise<void> }) {
  const [jobs, setJobs] = useState<{ id: string; name: string; meta: string }[] | null>(null);
  const [projectId, setProjectId] = useState("");
  const action = useAction();
  useEffect(() => {
    void action.run(async () => {
      const list = await api<{ id: string; name: string; meta: string }[]>("/documents/pin-jobs");
      setJobs(list);
      setProjectId(list.find((job) => !document.links.some((link) => link.projectId === job.id))?.id ?? "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const free = (jobs ?? []).filter((job) => !document.links.some((link) => link.projectId === job.id));
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent title="Pin to a job" description="It shows in the job's Documents and stays in the library. New versions show there too." desktop="dialog">
        <div className="flex flex-col gap-4 px-4 pb-4">
          {document.links.length > 0 && (
            <ul className="flex flex-col gap-2">
              {document.links.map((link) => (
                <li key={link.id} className="flex min-h-touch items-center gap-2 rounded-lg bg-muted px-3">
                  <a href={`/documents/job/${link.projectId}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">
                    {link.jobName}
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        await api(`/documents/links/${link.id}`, { method: "DELETE" });
                        await onSaved();
                      })
                    }
                  >
                    Take off
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {jobs === null ? (
            <p className="text-sm text-muted-foreground">Loading jobs…</p>
          ) : free.length === 0 ? (
            <p className="text-sm text-muted-foreground">{jobs.length ? "It's on all your active jobs." : "You've no active jobs."}</p>
          ) : (
            <>
              <SelectField label="Job" value={projectId} onChange={(event) => setProjectId(event.target.value)} options={free.map((job) => ({ value: job.id, label: job.meta ? `${job.name} · ${job.meta}` : job.name }))} />
              <Button
                disabled={action.busy || !projectId}
                onClick={() =>
                  void action.run(async () => {
                    await api(`/documents/doc/${document.id}/links`, { body: { projectId } });
                    await onSaved();
                  })
                }
              >
                Pin to this job
              </Button>
            </>
          )}
          <Alert variant="error">{action.error}</Alert>
        </div>
      </SheetContent>
    </Sheet>
  );
}
