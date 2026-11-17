"use client";

// Settings › Document libraries: the business's libraries (add, rename,
// remove an empty one, whether downloading is allowed) and the folders
// every job's Documents start with.

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Alert, Badge, Button, Field, FormActions, Input, List, ListRow, PageHeader, Section, Sheet, SheetContent, Stack, Switch, api, useAction } from "@grid/ui";
import type { LibraryJson } from "./DocumentsHome";

export function LibrarySettings({ libraries: initialLibraries, jobFolders: initialFolders }: { libraries: LibraryJson[]; jobFolders: string[] }) {
  const [libraries, setLibraries] = useState(initialLibraries);
  const [editing, setEditing] = useState<LibraryJson | "new" | null>(null);
  const reload = async () => setLibraries(await api<LibraryJson[]>("/documents/libraries"));

  return (
    <>
      <PageHeader title="Document libraries" subtitle="Where your business keeps manuals, data sheets and certificates, and the folders each job starts with." />
      <Stack>
        <Section
          title="Libraries"
          flush
          actions={
            <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
              <Plus /> Add
            </Button>
          }
        >
          <List>
            {libraries.map((library) => (
              <ListRow
                key={library.id}
                title={library.name}
                badges={!library.allowDownload && <Badge>View only</Badge>}
                meta={`${library.count} document${library.count === 1 ? "" : "s"}`}
                actions={
                  <Button variant="outline" size="sm" onClick={() => setEditing(library)}>
                    Change
                  </Button>
                }
              />
            ))}
          </List>
        </Section>
        <JobFolders initial={initialFolders} />
      </Stack>
      {editing && <LibrarySheet library={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </>
  );
}

function LibrarySheet({ library, onClose, onSaved }: { library: LibraryJson | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(library?.name ?? "");
  const [allowDownload, setAllowDownload] = useState(library?.allowDownload ?? true);
  const action = useAction();
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent title={library ? library.name : "Add a library"} desktop="dialog">
        <form
          className="flex flex-col gap-4 px-4 pb-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              const body = { name, allowDownload, isFinancial: library?.isFinancial ?? false, availableOffline: library?.availableOffline ?? false };
              if (library) await api(`/documents/libraries/${library.id}`, { method: "PUT", body });
              else await api("/documents/libraries", { body });
              await onSaved();
              onClose();
            });
          }}
        >
          <Field label="Name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={60} autoFocus placeholder="e.g. Procedures" />
          <label className="flex min-h-touch items-center justify-between gap-4">
            <span>
              <span className="block font-semibold">Allow download</span>
              <span className="block text-sm text-muted-foreground">For documents added from now on. Off: people can only read them in Grid.</span>
            </span>
            <Switch checked={allowDownload} onCheckedChange={setAllowDownload} />
          </label>
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            {library && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive sm:mr-auto"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    if (!window.confirm(`Remove the ${library.name} library?`)) return;
                    await api(`/documents/libraries/${library.id}`, { method: "DELETE" });
                    await onSaved();
                    onClose();
                  })
                }
              >
                <Trash2 /> Remove
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={action.busy || !name.trim()}>
              {library ? "Save" : "Add library"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function JobFolders({ initial }: { initial: string[] }) {
  const [folders, setFolders] = useState(initial);
  const [adding, setAdding] = useState("");
  const [saved, setSaved] = useState(false);
  const action = useAction();
  const change = (next: string[]) => {
    setFolders(next);
    setSaved(false);
  };
  const add = () => {
    const name = adding.trim();
    if (!name || folders.some((folder) => folder.toLowerCase() === name.toLowerCase())) return;
    change([...folders, name]);
    setAdding("");
  };
  return (
    <Section title="Job folders" description="Every job's Documents start with these folders. Jobs that already have folders keep theirs.">
      <div className="flex flex-col gap-3">
        <ul className="flex flex-wrap gap-2">
          {folders.map((folder) => (
            <li key={folder} className="flex h-10 items-center gap-1 rounded-full bg-muted pr-1 pl-4 text-sm font-semibold">
              {folder}
              <button type="button" aria-label={`Remove ${folder}`} onClick={() => change(folders.filter((entry) => entry !== folder))} className="flex size-8 items-center justify-center rounded-full hover:bg-background">
                <X className="size-4" />
              </button>
            </li>
          ))}
          {folders.length === 0 && <li className="text-sm text-muted-foreground">No folders: jobs start with an empty Documents section.</li>}
        </ul>
        <form
          className="flex gap-2 lg:max-w-2xl"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <Input value={adding} onChange={(event) => setAdding(event.target.value)} placeholder="Add a folder, e.g. Commissioning" maxLength={60} aria-label="New folder name" />
          <Button type="submit" variant="outline" disabled={!adding.trim()}>
            Add
          </Button>
        </form>
        <Alert variant="error">{action.error}</Alert>
        {saved && <Alert variant="success">Saved. New jobs start with these folders.</Alert>}
        <FormActions>
          <Button
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await api("/documents/settings", { method: "PUT", body: { jobFolders: folders } });
                setSaved(true);
              })
            }
          >
            Save folders
          </Button>
        </FormActions>
      </div>
    </Section>
  );
}
