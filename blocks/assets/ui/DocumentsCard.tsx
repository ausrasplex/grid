"use client";

// Manuals, links and documents on an asset's page (Docket's card of the
// same name): grouped by the whole asset and each kit piece, each group
// with its own "Add to …" (upload a PDF or photo, take a photo, or add a
// web link). A PDF or photo opens inside Grid. Manuals, warranties and
// links are shared with the asset's copies; receipts, certificates and
// photos stay on this one.
import { useRef, useState } from "react";
import { BookOpen, Camera, ChevronRight, ExternalLink, FileText, FileUp, Globe, Image as ImageIcon, Link2, Loader2, MoreHorizontal, Pencil, Plus, Puzzle, Receipt, ShieldCheck, Trash2 } from "lucide-react";
import { Alert, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Field, Section, SelectField, Sheet, SheetContent, api, useAction } from "@grid/ui";
import { host } from "./BrandCard";
import { dayText, photoUrl, uploadPhoto } from "./shared";

export interface DocumentJson {
  id: string;
  kind: string;
  title: string;
  fileId: string | null;
  url: string | null;
  mime: string | null;
  partId: string | null;
  fromCopy: boolean;
  shared: boolean;
  addedAt: string;
}

const KINDS = [
  { value: "MANUAL", label: "Manual", icon: BookOpen },
  { value: "WARRANTY", label: "Warranty", icon: ShieldCheck },
  { value: "RECEIPT", label: "Receipt or invoice", icon: Receipt },
  { value: "CERTIFICATE", label: "Certificate", icon: FileText },
  { value: "PHOTO", label: "Photo", icon: ImageIcon },
  { value: "OTHER", label: "Other", icon: FileText },
  { value: "LINK", label: "Web link", icon: Link2 },
];
const kindOf = (kind: string) => KINDS.find((entry) => entry.value === kind) ?? KINDS[5]!;
/** A guess at what an upload is from its name: "Manual", "Warranty", a photo… */
const guessKind = (file: File) => (file.type.startsWith("image/") ? "PHOTO" : /manual|guide|instruction/i.test(file.name) ? "MANUAL" : /warrant/i.test(file.name) ? "WARRANTY" : /receipt|invoice|tax/i.test(file.name) ? "RECEIPT" : /cert|test/i.test(file.name) ? "CERTIFICATE" : "OTHER");
const withoutExtension = (name: string) => name.replace(/\.[a-z0-9]{2,5}$/i, "");

interface Group {
  partId: string | null;
  name: string;
  isPiece: boolean;
  documents: DocumentJson[];
}

function DocumentRow({ assetId, document, canManage, onEdit, onRemove }: { assetId: string; document: DocumentJson; canManage: boolean; onEdit: () => void; onRemove: () => void }) {
  const kind = kindOf(document.kind);
  const Icon = document.url ? Globe : kind.icon;
  const meta = [kind.label, dayText(document.addedAt.slice(0, 10)), document.url ? host(document.url) : null, document.fromCopy ? "from a copy" : document.shared ? "shared with copies" : null].filter(Boolean).join(" · ");
  const href = document.url ?? `/assets/${assetId}/file/${document.fileId}`;
  const image = document.mime?.startsWith("image/");
  return (
    <div className="flex items-center gap-3 border-t py-3 first:border-t-0">
      <a href={href} {...(document.url ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="group flex min-h-touch min-w-0 flex-1 items-center gap-3">
        {image && document.fileId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl(document.fileId, "thumb")} alt="" className="size-11 shrink-0 rounded-xl object-cover" loading="lazy" />
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted">
            <Icon className="size-5" />
          </span>
        )}
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-bold">{document.title}</span>
          <span className="truncate text-xs font-medium text-muted-foreground">{meta}</span>
        </span>
        {document.url ? <ExternalLink className="ml-auto size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />}
      </a>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Options for ${document.title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-52">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              <Trash2 /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function AddButton({ assetId, group, onLink, onError }: { assetId: string; group: Group; onLink: () => void; onError: (message: string | null) => void }) {
  const files = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (list: FileList | null) => {
    const picked = [...(list ?? [])];
    if (!picked.length) return;
    setBusy(true);
    onError(null);
    try {
      for (const file of picked) {
        const fileId = await uploadPhoto(file);
        await api(`/assets/${assetId}/documents`, { body: { kind: guessKind(file), title: withoutExtension(file.name) || "Document", fileId, partId: group.partId } });
      }
      window.location.reload();
    } catch (failure) {
      onError((failure as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="mt-1 self-start" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            {busy ? "Uploading…" : `Add to ${group.name}`}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuItem onSelect={() => files.current?.click()}>
            <FileUp /> Upload PDF or photo
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => camera.current?.click()}>
            <Camera /> Take photo
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onLink}>
            <Globe /> Add web link
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input ref={files} type="file" accept="application/pdf,image/*" multiple hidden onChange={(event) => void upload(event.target.files)} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void upload(event.target.files)} />
    </>
  );
}

export function DocumentsCard({ assetId, assetName, documents, pieces, copies, canManage }: { assetId: string; assetName: string; documents: DocumentJson[]; pieces: { id: string; name: string }[]; copies: number; canManage: boolean }) {
  const [editing, setEditing] = useState<DocumentJson | null>(null);
  const [linkFor, setLinkFor] = useState<Group | null>(null);
  const action = useAction();
  const groups: Group[] = [
    { partId: null, name: pieces.length ? "Whole asset" : assetName, isPiece: false, documents: documents.filter((document) => !document.partId) },
    ...pieces.map((piece) => ({ partId: piece.id, name: piece.name, isPiece: true, documents: documents.filter((document) => document.partId === piece.id) })),
  ];
  const remove = (document: DocumentJson) => {
    if (!window.confirm(`Remove ${document.title}?${document.shared || document.fromCopy ? " It comes off every copy of this asset." : ""}`)) return;
    void action.run(async () => (await api(`/assets/${assetId}/documents/${document.id}`, { method: "DELETE" }), window.location.reload()));
  };

  return (
    <Section
      title="Manuals, links and documents"
      description={[
        pieces.length ? "Grouped by kit piece. Add as many as you like to each." : "Add as many as you like: manuals, the warranty, receipts, certificates, support pages.",
        copies ? `Manuals, warranties and links are shared with ${copies === 1 ? "1 other copy" : `${copies} other copies`}; receipts, certificates and photos stay on this one.` : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div id="documents" className="flex scroll-mt-24 flex-col gap-5">
        {groups.map((group) => (
          <section key={group.partId ?? "asset"} className="flex flex-col gap-1">
            {groups.length > 1 && (
              <h3 className="flex items-center gap-2 font-bold">
                {group.isPiece && <Puzzle className="size-4 text-muted-foreground" />}
                {group.name}
                <span className="text-xs font-semibold text-muted-foreground">{group.documents.length}</span>
              </h3>
            )}
            {group.documents.length ? (
              <div className="flex flex-col">
                {group.documents.map((document) => (
                  <DocumentRow key={document.id} assetId={assetId} document={document} canManage={canManage} onEdit={() => setEditing(document)} onRemove={() => remove(document)} />
                ))}
              </div>
            ) : (
              <p className="py-2 text-sm text-muted-foreground">Nothing yet.</p>
            )}
            {canManage && <AddButton assetId={assetId} group={group} onLink={() => setLinkFor(group)} onError={action.setError} />}
          </section>
        ))}
        <Alert variant="error">{action.error}</Alert>
      </div>
      {editing && <EditSheet assetId={assetId} document={editing} onClose={() => setEditing(null)} />}
      {linkFor && <LinkSheet assetId={assetId} group={linkFor} onClose={() => setLinkFor(null)} />}
    </Section>
  );
}

function EditSheet({ assetId, document, onClose }: { assetId: string; document: DocumentJson; onClose: () => void }) {
  const [title, setTitle] = useState(document.title);
  const [kind, setKind] = useState(document.kind);
  const action = useAction();
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        title="Edit details"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={action.busy || !title.trim()} onClick={() => void action.run(async () => (await api(`/assets/${assetId}/documents/${document.id}`, { method: "PUT", body: { title, kind } }), window.location.reload()))}>
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 px-2">
          <Field label="Name" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
          {!document.url && <SelectField label="What it is" value={kind} onChange={(event) => setKind(event.target.value)} options={KINDS.filter((entry) => entry.value !== "LINK").map((entry) => ({ value: entry.value, label: entry.label }))} hint="Manuals and warranties are shared with copies of this asset." />}
          <Alert variant="error">{action.error}</Alert>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LinkSheet({ assetId, group, onClose }: { assetId: string; group: Group; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const action = useAction();
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        title="Add web link"
        description={`A support page, a manual online or a how-to video, for ${group.name}.`}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={action.busy || !url.trim()}
              onClick={() => void action.run(async () => (await api(`/assets/${assetId}/documents`, { body: { kind: "LINK", title: title.trim() || host(/^https?:\/\//i.test(url) ? url : `https://${url}`), url, partId: group.partId } }), window.location.reload()))}
            >
              <Link2 /> Add link
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 px-2">
          <Field label="Web address" inputMode="url" placeholder="makita.com.au/…" value={url} onChange={(event) => setUrl(event.target.value)} autoFocus />
          <Field label="Name (optional)" placeholder="e.g. Battery recall notice" value={title} onChange={(event) => setTitle(event.target.value)} />
          <Alert variant="error">{action.error}</Alert>
        </div>
      </SheetContent>
    </Sheet>
  );
}
