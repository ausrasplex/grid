"use client";

// /documents/icon/<icon key>: the manuals linked to an icon type (phase 4c
// part 3). A placed icon on a plan opens this (Manuals), so the install
// guide for a "Double GPO" or a smoke alarm is one tap away. Link library
// documents to the type; it's the same list on every job.

import { useEffect, useState } from "react";
import { ArrowLeft, Link2, X } from "lucide-react";
import { ActionButton, Alert, Button, EmptyState, List, PageHeader, SearchInput, Section, Sheet, SheetContent, Stack, api, useAction } from "@grid/ui";
import { DocumentLink, matches, type DocumentRowJson } from "./shared";

export function IconDocuments({ iconKey, initial, canEdit }: { iconKey: string; initial: DocumentRowJson[]; canEdit: boolean }) {
  const [rows, setRows] = useState(initial);
  const [picking, setPicking] = useState(false);
  const [where, setWhere] = useState<{ name: string; back: string | null }>({ name: "This icon", back: null });
  const action = useAction();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const back = params.get("back");
    // Only back to a page in Grid.
    setWhere({ name: params.get("name")?.slice(0, 80) || "This icon", back: back && back.startsWith("/") && !back.startsWith("//") ? back : null });
  }, []);
  const path = `/documents/icon/${encodeURIComponent(iconKey)}`;

  return (
    <>
      {where.back && (
        <a href={where.back} className="mb-2 flex min-h-touch items-center gap-1 self-start text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to the plan
        </a>
      )}
      <PageHeader
        title={`Manuals: ${where.name}`}
        subtitle="Documents linked to this icon type. Tapping one of these icons on any plan offers them."
        actions={canEdit && <ActionButton icon={<Link2 />} label="Link a manual" onClick={() => setPicking(true)} />}
      />
      <Stack>
        <Section flush>
          {rows.length === 0 ? (
            <EmptyState title="No manuals linked yet">{canEdit ? "Link the install guide or data sheet from your library." : "Someone who edits documents can link them."}</EmptyState>
          ) : (
            <List>
              {rows.map((row) => (
                <DocumentLink
                  key={row.id}
                  row={row}
                  meta={row.libraryName ?? null}
                  after={
                    canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Unlink ${row.title}`}
                        disabled={action.busy}
                        onClick={() => void action.run(async () => setRows(await api<DocumentRowJson[]>(`${path}/${row.id}`, { method: "DELETE" })))}
                      >
                        <X />
                      </Button>
                    )
                  }
                />
              ))}
            </List>
          )}
        </Section>
        <Alert variant="error">{action.error}</Alert>
      </Stack>
      {picking && (
        <LibraryPicker
          already={new Set(rows.map((row) => row.id))}
          onClose={() => setPicking(false)}
          onPick={async (documentId) => {
            setRows(await api<DocumentRowJson[]>(path, { body: { documentId } }));
            setPicking(false);
          }}
        />
      )}
    </>
  );
}

function LibraryPicker({ already, onPick, onClose }: { already: Set<string>; onPick: (documentId: string) => Promise<void>; onClose: () => void }) {
  const [rows, setRows] = useState<DocumentRowJson[] | null>(null);
  const [query, setQuery] = useState("");
  const action = useAction();
  useEffect(() => {
    void action.run(async () => setRows(await api<DocumentRowJson[]>("/documents/library")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const shown = (rows ?? []).filter((row) => !already.has(row.id) && matches(row, query)).slice(0, 50);
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent title="Link a manual" description="From your libraries. It stays in its library; this only links it to the icon." desktop="dialog">
        <div className="flex flex-col gap-3 px-4 pb-4">
          <SearchInput label="Search the library" placeholder="Title, manufacturer or model" value={query} onChange={(event) => setQuery(event.target.value)} />
          <ul className="flex flex-col divide-y rounded-lg border">
            {shown.map((row) => (
              <li key={row.id}>
                <button type="button" disabled={action.busy} onClick={() => void action.run(() => onPick(row.id))} className="flex min-h-touch-lg w-full flex-col items-start px-3 py-2 text-left hover:bg-muted">
                  <span className="font-medium">{row.title}</span>
                  <span className="text-sm text-muted-foreground">{[row.libraryName, row.manufacturer].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            ))}
            {rows && !shown.length && <li className="px-3 py-4 text-sm text-muted-foreground">{query ? "Nothing matches." : "Nothing else in your libraries."}</li>}
          </ul>
          <Alert variant="error">{action.error}</Alert>
        </div>
      </SheetContent>
    </Sheet>
  );
}
