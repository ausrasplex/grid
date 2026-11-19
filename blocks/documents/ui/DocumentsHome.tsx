"use client";

// Documents: the business's libraries (Manuals, Data sheets…). Pick a
// library with the chips, search by title, manufacturer, model or tag,
// and upload into a library.

import { useCallback, useEffect, useRef, useState } from "react";
import { Settings, Upload } from "lucide-react";
import { ActionButton, Alert, Button, EmptyState, List, PageHeader, SearchInput, Section, SelectField, Sheet, SheetContent, Stack, api, useAction } from "@grid/ui";
import { UPLOAD_ACCEPT } from "../kinds";
import { SearchResults } from "./SearchResults";
import { Chips, DocumentLink, UploadList, matches, useUploads, type DocumentRowJson } from "./shared";

export interface LibraryJson {
  id: string;
  name: string;
  isFinancial: boolean;
  allowDownload: boolean;
  availableOffline: boolean;
  count: number;
}

interface AddResult {
  added: { id: string; title: string }[];
  duplicates: { fileId: string; fileName: string; title: string }[];
}

/** "Added 3 documents." plus what was skipped. */
export function addedMessage(result: AddResult, where: string) {
  const count = result.added.length;
  return count ? `Added ${count === 1 ? `“${result.added[0]!.title}”` : `${count} documents`} to ${where}.` : null;
}

export function DuplicatesAlert({ duplicates, where, onAddAnyway, busy }: { duplicates: AddResult["duplicates"]; where: string; onAddAnyway: () => void; busy: boolean }) {
  if (!duplicates.length) return null;
  return (
    <Alert>
      <p>
        {duplicates.length === 1
          ? `${duplicates[0]!.fileName} is already in ${where} as “${duplicates[0]!.title}”, so it wasn't added again.`
          : `${duplicates.length} files are already in ${where}, so they weren't added again: ${duplicates.map((duplicate) => duplicate.fileName).join(", ")}.`}
      </p>
      <Button variant="outline" size="sm" className="mt-2" disabled={busy} onClick={onAddAnyway}>
        Add {duplicates.length === 1 ? "it" : "them"} anyway
      </Button>
    </Alert>
  );
}

export function DocumentsHome({
  libraries: initialLibraries,
  documents: initialDocuments,
  libraryId: initialLibraryId,
  permissions,
}: {
  libraries: LibraryJson[];
  documents: DocumentRowJson[];
  libraryId: string | null;
  permissions: { upload: boolean; manageLibraries: boolean };
}) {
  const [libraries, setLibraries] = useState(initialLibraries);
  const [documents, setDocuments] = useState(initialDocuments);
  const [libraryId, setLibraryId] = useState<string>(initialLibraryId ?? "ALL");
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<string>(initialLibraryId ?? initialLibraries[0]?.id ?? "");
  const [done, setDone] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<{ list: AddResult["duplicates"]; libraryId: string } | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const { uploads, uploadAll, clearDone } = useUploads();
  const action = useAction();
  const input = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const [nextLibraries, nextDocuments] = await Promise.all([api<LibraryJson[]>("/documents/libraries"), api<DocumentRowJson[]>("/documents/library")]);
    setLibraries(nextLibraries);
    setDocuments(nextDocuments);
  }, []);

  // Keep checking while PDFs are being made ready.
  const pending = documents.some((row) => row.status === "PENDING");
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void reload().catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, [pending, reload]);

  function choose(id: string) {
    setLibraryId(id);
    if (id !== "ALL") setTarget(id);
    try {
      window.history.replaceState(null, "", id === "ALL" ? "/documents" : `/documents/library/${id}`);
    } catch {
      /* not important */
    }
  }

  const libraryName = (id: string) => libraries.find((library) => library.id === id)?.name ?? "the library";
  const shown = documents.filter((row) => (libraryId === "ALL" || row.libraryId === libraryId) && matches(row, query));
  const current = libraries.find((library) => library.id === libraryId);

  async function add(fileIds: string[], into: string, allowDuplicates: boolean) {
    setWorking("Adding them…");
    try {
      const result = await api<AddResult>("/documents/add", { body: { fileIds, libraryId: into, allowDuplicates } });
      setDone(addedMessage(result, libraryName(into)));
      setDuplicates(result.duplicates.length ? { list: result.duplicates, libraryId: into } : null);
      await reload();
    } finally {
      setWorking(null);
    }
  }

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    const into = target;
    setPicking(false);
    setDone(null);
    setDuplicates(null);
    await action.run(async () => {
      const ids = await uploadAll([...files]);
      if (input.current) input.current.value = "";
      clearDone();
      if (ids.length) await add(ids, into, false);
    });
  }

  function startUpload() {
    if (libraryId !== "ALL") {
      setTarget(libraryId);
      input.current?.click();
    } else setPicking(true);
  }

  return (
    <>
      <PageHeader
        title={current?.name ?? "Documents"}
        meta={`${documents.length} document${documents.length === 1 ? "" : "s"} in ${libraries.length} librar${libraries.length === 1 ? "y" : "ies"}`}
        actions={
          <>
            {permissions.manageLibraries && (
              <a href="/documents/settings" aria-label="Document libraries" title="Document libraries" className="flex size-touch items-center justify-center rounded-(--radius-button) border border-input bg-card hover:bg-muted">
                <Settings className="size-5" />
              </a>
            )}
            {permissions.upload && libraries.length > 0 && <ActionButton icon={<Upload />} label="Upload" onClick={startUpload} />}
          </>
        }
      />
      <input ref={input} type="file" multiple hidden accept={UPLOAD_ACCEPT} onChange={(event) => void pick(event.target.files)} aria-label="Document files" />
      <Stack>
        <UploadList uploads={uploads} working={working} />
        <Alert variant="error">{action.error}</Alert>
        <Alert variant="success">{done}</Alert>
        {duplicates && (
          <DuplicatesAlert
            duplicates={duplicates.list}
            where={libraryName(duplicates.libraryId)}
            busy={action.busy}
            onAddAnyway={() => void action.run(() => add(duplicates.list.map((duplicate) => duplicate.fileId), duplicates.libraryId, true))}
          />
        )}

        <div className="flex flex-col gap-3">
          <SearchInput label="Search documents" placeholder="Title, model, tag, or words inside" value={query} onChange={(event) => setQuery(event.target.value)} />
          <Chips
            label="Library"
            value={libraryId}
            onChange={choose}
            items={[{ value: "ALL", label: "All", count: documents.length }, ...libraries.map((library) => ({ value: library.id, label: library.name, count: library.count }))]}
          />
        </div>

        <Section flush>
          {shown.length === 0 ? (
            query ? (
              <EmptyState title="No titles match">Try fewer words, or a model number without the dashes.</EmptyState>
            ) : (
              <EmptyState title={current ? `Nothing in ${current.name} yet` : "No documents yet"}>
                {permissions.upload ? (
                  <>
                    Upload manuals, data sheets and certificates: PDFs, photos, Word and Excel files.
                    <div className="mt-4">
                      <Button onClick={startUpload}>
                        <Upload /> Upload
                      </Button>
                    </div>
                  </>
                ) : (
                  "Nobody has uploaded anything here yet."
                )}
              </EmptyState>
            )
          ) : (
            <List>
              {shown.map((row) => (
                <DocumentLink key={row.id} row={row} meta={libraryId === "ALL" ? row.libraryName : row.manufacturer || null} />
              ))}
            </List>
          )}
        </Section>
        <SearchResults query={query} />
      </Stack>

      <Sheet open={picking} onOpenChange={setPicking}>
        <SheetContent title="Upload documents" description="PDFs, photos, Word, Excel and CSV files. Pick a library first." desktop="dialog">
          <div className="flex flex-col gap-4 px-4 pt-2 pb-4">
            <SelectField label="Library" value={target} onChange={(event) => setTarget(event.target.value)} options={libraries.map((library) => ({ value: library.id, label: library.name }))} />
            <Button size="lg" onClick={() => input.current?.click()} disabled={!target}>
              <Upload /> Choose files
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
