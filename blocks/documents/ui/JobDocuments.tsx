"use client";

// A job's documents: fit-off sheets, points lists, schedules… in the job's
// folders, plus library documents pinned to the job (marked "Library").
// Upload straight to a folder, add from the library, and tidy folders.

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, FolderPlus, Library, MoreHorizontal, Upload } from "lucide-react";
import { ActionButton, Alert, Badge, Button, EmptyState, Field, FormActions, List, PageHeader, SearchInput, Section, SelectField, Sheet, SheetContent, Stack, api, useAction } from "@grid/ui";
import { UPLOAD_ACCEPT } from "../kinds";
import { DuplicatesAlert, addedMessage } from "./DocumentsHome";
import { SearchResults } from "./SearchResults";
import { DocumentLink, UploadList, matches, useUploads, type DocumentRowJson } from "./shared";

export interface JobDocumentsJson {
  folders: { id: string; name: string }[];
  documents: DocumentRowJson[];
  links: { id: string; folderId: string | null; document: DocumentRowJson }[];
}

type Duplicate = { fileId: string; fileName: string; title: string };
const NONE = "__none";

export function JobDocuments({ job, initial, permissions }: { job: { id: string; name: string }; initial: JobDocumentsJson; permissions: { upload: boolean; edit: boolean } }) {
  const [data, setData] = useState(initial);
  const [query, setQuery] = useState("");
  const [uploadTo, setUploadTo] = useState<string | null>(null);
  const [folderTarget, setFolderTarget] = useState<string>(NONE);
  const [folderSheet, setFolderSheet] = useState<{ id: string | null; name: string } | null>(null);
  const [linkSheet, setLinkSheet] = useState<JobDocumentsJson["links"][number] | null>(null);
  const [fromLibrary, setFromLibrary] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<{ list: Duplicate[]; folderId: string | null } | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const { uploads, uploadAll, clearDone } = useUploads();
  const action = useAction();
  const input = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => setData(await api<JobDocumentsJson>(`/documents/job/${job.id}`)), [job.id]);
  const pending = data.documents.some((row) => row.status === "PENDING");
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void reload().catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, [pending, reload]);

  const total = data.documents.length + data.links.length;
  const folderName = (id: string | null) => data.folders.find((folder) => folder.id === id)?.name ?? "this job";

  async function add(fileIds: string[], folderId: string | null, allowDuplicates: boolean) {
    setWorking("Adding them…");
    try {
      const result = await api<{ added: { id: string; title: string }[]; duplicates: Duplicate[] }>("/documents/add", { body: { fileIds, projectId: job.id, folderId, allowDuplicates } });
      setDone(addedMessage(result, folderName(folderId)));
      setDuplicates(result.duplicates.length ? { list: result.duplicates, folderId } : null);
      await reload();
    } finally {
      setWorking(null);
    }
  }

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    const folderId = folderTarget === NONE ? null : folderTarget;
    setUploadTo(null);
    setDone(null);
    setDuplicates(null);
    await action.run(async () => {
      const ids = await uploadAll([...files]);
      if (input.current) input.current.value = "";
      clearDone();
      if (ids.length) await add(ids, folderId, false);
    });
  }

  function startUpload(folderId: string | null) {
    setFolderTarget(folderId ?? data.folders[0]?.id ?? NONE);
    setUploadTo(folderId ?? "pick");
    if (folderId) input.current?.click();
  }

  // What goes in each folder (and the ones in no folder), filtered by the search.
  const groups = [...data.folders.map((folder) => ({ id: folder.id as string | null, name: folder.name })), { id: null, name: "Not in a folder" }].map((group) => ({
    ...group,
    documents: data.documents.filter((row) => (row.folderId ?? null) === group.id && matches(row, query)),
    links: data.links.filter((link) => (link.folderId ?? null) === group.id && matches(link.document, query)),
  }));
  const folderOptions = [...data.folders.map((folder) => ({ value: folder.id, label: folder.name })), { value: NONE, label: "Not in a folder" }];

  return (
    <>
      <PageHeader
        title="Documents"
        meta={
          <a href={`/jobs/${job.id}`} className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="size-3.5" /> {job.name}
          </a>
        }
        actions={permissions.upload && <ActionButton icon={<Upload />} label="Upload" onClick={() => startUpload(null)} />}
      />
      <input ref={input} type="file" multiple hidden accept={UPLOAD_ACCEPT} onChange={(event) => void pick(event.target.files)} aria-label="Document files" />
      <Stack>
        <UploadList uploads={uploads} working={working} />
        <Alert variant="error">{action.error}</Alert>
        <Alert variant="success">{done}</Alert>
        {duplicates && (
          <DuplicatesAlert
            duplicates={duplicates.list}
            where={folderName(duplicates.folderId)}
            busy={action.busy}
            onAddAnyway={() => void action.run(() => add(duplicates.list.map((duplicate) => duplicate.fileId), duplicates.folderId, true))}
          />
        )}
        {total > 0 && <SearchInput label="Search this job's documents" placeholder="Title, tag, or words inside" value={query} onChange={(event) => setQuery(event.target.value)} />}
        <SearchResults query={query} projectId={job.id} />

        {total === 0 && !permissions.upload ? (
          <Section>
            <EmptyState title="No documents yet">Nobody has added documents to this job yet.</EmptyState>
          </Section>
        ) : (
          groups.map((group) => {
            const count = group.documents.length + group.links.length;
            // "Not in a folder" only shows when something's in it.
            if (group.id === null && !count) return null;
            if (query && !count) return null;
            return (
              <Section
                key={group.id ?? NONE}
                title={group.name}
                flush
                actions={
                  group.id &&
                  (permissions.upload || permissions.edit) && (
                    <>
                      {permissions.upload && (
                        <Button variant="ghost" size="icon" aria-label={`Upload to ${group.name}`} title={`Upload to ${group.name}`} onClick={() => startUpload(group.id)}>
                          <Upload />
                        </Button>
                      )}
                      {permissions.edit && (
                        <Button variant="ghost" size="icon" aria-label={`Change the ${group.name} folder`} title="Rename or remove" onClick={() => setFolderSheet({ id: group.id, name: group.name })}>
                          <MoreHorizontal />
                        </Button>
                      )}
                    </>
                  )
                }
              >
                {count === 0 ? (
                  <p className="px-4 pb-4 text-sm text-muted-foreground sm:px-5">Empty</p>
                ) : (
                  <List>
                    {group.documents.map((row) => (
                      <DocumentLink key={row.id} row={row} />
                    ))}
                    {group.links.map((link) => (
                      <DocumentLink
                        key={link.id}
                        row={link.document}
                        meta={link.document.libraryName}
                        badge={<Badge variant="secondary">Library</Badge>}
                        after={
                          permissions.edit && (
                            <Button variant="ghost" size="icon" className="mr-2 sm:mr-3" aria-label={`Change where ${link.document.title} shows`} onClick={() => setLinkSheet(link)}>
                              <MoreHorizontal />
                            </Button>
                          )
                        }
                      />
                    ))}
                  </List>
                )}
              </Section>
            );
          })
        )}

        {permissions.edit && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setFolderSheet({ id: null, name: "" })}>
              <FolderPlus /> Add a folder
            </Button>
            <Button variant="outline" onClick={() => setFromLibrary(true)}>
              <Library /> Add from the library
            </Button>
          </div>
        )}
      </Stack>

      <Sheet open={uploadTo === "pick"} onOpenChange={(open) => !open && setUploadTo(null)}>
        <SheetContent title="Upload to this job" description="Fit-off sheets, points lists, schedules: PDFs, photos, Word and Excel files." desktop="dialog">
          <div className="flex flex-col gap-4 px-4 pt-2 pb-4">
            <SelectField label="Folder" value={folderTarget} onChange={(event) => setFolderTarget(event.target.value)} options={folderOptions} />
            <Button size="lg" onClick={() => input.current?.click()}>
              <Upload /> Choose files
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {folderSheet && <FolderSheet projectId={job.id} folder={folderSheet} onClose={() => setFolderSheet(null)} onSaved={reload} />}
      {linkSheet && <LinkSheet link={linkSheet} folders={folderOptions} onClose={() => setLinkSheet(null)} onSaved={reload} />}
      {fromLibrary && (
        <FromLibrarySheet
          projectId={job.id}
          folders={folderOptions}
          already={new Set(data.links.map((link) => link.document.id))}
          onClose={() => setFromLibrary(false)}
          onSaved={async (message) => {
            setDone(message);
            await reload();
          }}
        />
      )}
    </>
  );
}

function FolderSheet({ projectId, folder, onClose, onSaved }: { projectId: string; folder: { id: string | null; name: string }; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(folder.name);
  const action = useAction();
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent title={folder.id ? `${folder.name} folder` : "Add a folder"} desktop="dialog">
        <form
          className="flex flex-col gap-4 px-4 pb-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              if (folder.id) await api(`/documents/folders/${folder.id}`, { method: "PUT", body: { name } });
              else await api(`/documents/job/${projectId}/folders`, { body: { name } });
              await onSaved();
              onClose();
            });
          }}
        >
          <Field label="Folder name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required autoFocus placeholder="e.g. Commissioning" />
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            {folder.id && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive sm:mr-auto"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    if (!window.confirm(`Remove the ${folder.name} folder? Anything in it stays on the job, under "Not in a folder".`)) return;
                    await api(`/documents/folders/${folder.id}`, { method: "DELETE" });
                    await onSaved();
                    onClose();
                  })
                }
              >
                Remove folder
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={action.busy || !name.trim()}>
              {folder.id ? "Save" : "Add folder"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function LinkSheet({ link, folders, onClose, onSaved }: { link: JobDocumentsJson["links"][number]; folders: { value: string; label: string }[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [folderId, setFolderId] = useState(link.folderId ?? NONE);
  const action = useAction();
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent title={link.document.title} description={`From ${link.document.libraryName ?? "the library"}. Changes here don't touch the library copy.`} desktop="dialog">
        <div className="flex flex-col gap-4 px-4 pb-4">
          <SelectField label="Show it in" value={folderId} onChange={(event) => setFolderId(event.target.value)} options={folders} />
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button
              variant="ghost"
              className="text-destructive sm:mr-auto"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await api(`/documents/links/${link.id}`, { method: "DELETE" });
                  await onSaved();
                  onClose();
                })
              }
            >
              Take off this job
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await api(`/documents/links/${link.id}`, { method: "PATCH", body: { folderId: folderId === NONE ? null : folderId } });
                  await onSaved();
                  onClose();
                })
              }
            >
              Save
            </Button>
          </FormActions>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FromLibrarySheet({
  projectId,
  folders,
  already,
  onClose,
  onSaved,
}: {
  projectId: string;
  folders: { value: string; label: string }[];
  already: Set<string>;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [rows, setRows] = useState<DocumentRowJson[] | null>(null);
  const [query, setQuery] = useState("");
  const [folderId, setFolderId] = useState(folders[0]?.value ?? NONE);
  const action = useAction();
  useEffect(() => {
    void action.run(async () => setRows(await api<DocumentRowJson[]>("/documents/library")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const shown = (rows ?? []).filter((row) => !already.has(row.id) && matches(row, query)).slice(0, 50);
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent title="Add from the library" description="It shows on this job and stays in the library. A new version in the library shows here too." desktop="dialog">
        <div className="flex flex-col gap-3 px-4 pb-4">
          <SelectField label="Show it in" value={folderId} onChange={(event) => setFolderId(event.target.value)} options={folders} />
          <SearchInput label="Search the library" placeholder="Title, manufacturer or model" value={query} onChange={(event) => setQuery(event.target.value)} />
          <Alert variant="error">{action.error}</Alert>
          {rows === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">{rows.length ? "Nothing matches." : "The library is empty."}</p>
          ) : (
            <ul className="-mx-4 divide-y border-y">
              {shown.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    disabled={action.busy}
                    className="flex min-h-touch-lg w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted"
                    onClick={() =>
                      void action.run(async () => {
                        await api(`/documents/doc/${row.id}/links`, { body: { projectId, folderId: folderId === NONE ? null : folderId } });
                        await onSaved(`Added “${row.title}” from ${row.libraryName ?? "the library"}.`);
                        onClose();
                      })
                    }
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{row.title}</span>
                      <span className="block truncate text-sm text-muted-foreground">{[row.libraryName, row.manufacturer].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="text-sm font-semibold text-primary">Add</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
