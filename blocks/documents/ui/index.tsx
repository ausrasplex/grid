// Documents pages and the panels it puts on other pages.
//   /documents                         every library, search, upload
//   /documents/library/<id>            one library
//   /documents/doc/<id>[/<versionId>]  one document in the viewer
//   /documents/job/<projectId>         a job's documents and folders
//   /documents/settings                Settings › Document libraries
//   panel "job.area"                   "Documents · 12" on a job page
//   panel "storage.deleted"            Recently deleted documents

import { FolderOpen } from "lucide-react";
import { can, forbidden, notFound } from "@grid/core";
import { getStorageSettings } from "@grid/db";
import type { BlockPages, BlockPanels } from "@grid/ui";
import { getProject, type JobAreaPanelProps } from "@grid/block-projects";
import { documentsForJobPanel, getDocument, getSettings, jobDocuments, listDeleted, listLibraries, listLibraryDocuments } from "../service";
import { DeletedDocuments, type DeletedDocumentJson } from "./DeletedDocuments";
import { DocumentPage, type DocumentJson } from "./DocumentPage";
import { DocumentsHome } from "./DocumentsHome";
import { JobDocuments, type JobDocumentsJson } from "./JobDocuments";
import { LibrarySettings } from "./LibrarySettings";
import type { DocumentRowJson } from "./shared";

/** Dates → strings, the way they reach a client component anyway. */
const json = <T,>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

async function home(ctx: Parameters<BlockPages[string]>[0]["ctx"], libraryId: string | null) {
  const [libraries, documents] = await Promise.all([listLibraries(ctx), listLibraryDocuments(ctx, null)]);
  if (libraryId && !libraries.some((library) => library.id === libraryId)) throw notFound();
  return (
    <DocumentsHome
      libraries={libraries}
      documents={json<DocumentRowJson[]>(documents)}
      libraryId={libraryId}
      permissions={{ upload: can(ctx, "documents.upload"), manageLibraries: can(ctx, "documents.libraries.manage") }}
    />
  );
}

export const pages: BlockPages = {
  "": async ({ ctx }) => home(ctx, null),
  library: async ({ ctx, params: [libraryId] }) => home(ctx, libraryId ?? null),

  doc: async ({ ctx, params: [documentId, versionId] }) => {
    const document = await getDocument(ctx, documentId ?? "");
    const [libraries, job, settings] = await Promise.all([
      document.library ? listLibraries(ctx) : Promise.resolve([]),
      document.job ? jobDocuments(ctx, document.job.id) : Promise.resolve(null),
      getStorageSettings(),
    ]);
    return (
      <DocumentPage
        initial={json<DocumentJson>(document)}
        versionId={versionId && document.versions.some((version) => version.id === versionId) ? versionId : null}
        libraries={libraries.map((library) => ({ id: library.id, name: library.name }))}
        folders={job?.folders ?? []}
        permissions={{ upload: can(ctx, "documents.upload"), edit: can(ctx, "documents.edit"), delete: can(ctx, "documents.delete") }}
        deletedDays={settings.deletedDays}
      />
    );
  },

  job: async ({ ctx, params: [projectId] }) => {
    const job = await getProject(ctx, projectId ?? "");
    const data = await jobDocuments(ctx, job.id);
    return <JobDocuments job={{ id: job.id, name: job.name }} initial={json<JobDocumentsJson>(data)} permissions={{ upload: can(ctx, "documents.upload"), edit: can(ctx, "documents.edit") }} />;
  },

  settings: async ({ ctx }) => {
    if (!can(ctx, "documents.libraries.manage")) throw forbidden("Only people who set up document libraries can change these");
    const [libraries, settings] = await Promise.all([listLibraries(ctx), getSettings(ctx)]);
    return <LibrarySettings libraries={libraries} jobFolders={settings.jobFolders} />;
  },
};

export const panels: BlockPanels = {
  "job.area": async (props) => {
    const { ctx, job } = props as typeof props & JobAreaPanelProps;
    if (!can(ctx, "documents.view")) return null;
    const { total, recent } = await documentsForJobPanel(ctx, job.id);
    if (!total && !can(ctx, "documents.upload")) return null;
    return (
      <section className="overflow-hidden rounded-xl border bg-card" aria-label="Documents">
        <a href={`/documents/job/${job.id}`} className="flex min-h-touch-lg items-center gap-3 px-4 py-3 hover:bg-muted">
          <FolderOpen className="size-5 text-primary" />
          <span className="flex-1 font-semibold">Documents</span>
          <span className="text-sm text-muted-foreground">{total ? `${total} document${total === 1 ? "" : "s"}` : "Add fit-off sheets, points lists…"}</span>
        </a>
        {recent.length > 0 && (
          <ul className="divide-y border-t">
            {recent.map((item) => (
              <li key={item.id}>
                <a href={`/documents/doc/${item.id}`} className="flex min-h-touch items-center gap-3 px-4 py-2 hover:bg-muted">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.title}</span>
                  {item.status === "PENDING" && <span className="shrink-0 text-xs text-muted-foreground">Getting ready…</span>}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  },

  // Settings › Storage: Recently deleted documents (people who can delete them).
  "storage.deleted": async ({ ctx }) => {
    if (!can(ctx, "documents.delete")) return null;
    const [rows, settings] = await Promise.all([listDeleted(ctx), getStorageSettings()]);
    if (!rows.length) return null;
    return <DeletedDocuments initial={json<DeletedDocumentJson[]>(rows)} days={settings.deletedDays} />;
  },
};
