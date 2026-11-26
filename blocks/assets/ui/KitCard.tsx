"use client";

// Kit pieces on an asset's page (Docket's Parts card): the batteries,
// charger and case that come with it, each with its own make, model,
// serial, warranty and photo. Not tagged on their own; a piece that moves
// about by itself is better as its own asset.
import { useRef, useState } from "react";
import { Camera, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { Alert, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Field, Label, Section, Sheet, SheetContent, api, useAction } from "@grid/ui";
import { CategoryTile } from "./CategoryTile";
import { Chip, TextArea, WARRANTY_TONE, photoUrl, uploadPhoto, type WarrantyJson } from "./shared";

export interface PartJson {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  serial: string | null;
  warrantyEndsOn: string | null;
  warranty: WarrantyJson;
  photoFileId: string | null;
  notes: string | null;
  documentCount: number;
}

export function KitCard({ assetId, assetMake, parts, canManage }: { assetId: string; assetMake: string | null; parts: PartJson[]; canManage: boolean }) {
  const [editing, setEditing] = useState<PartJson | "new" | null>(null);
  const action = useAction();
  return (
    <Section title="Kit pieces" description="Pieces with their own model, serial or warranty: the batteries, charger and case.">
      <div className="flex flex-col gap-3">
        {parts.length ? (
          <ul className="flex flex-col">
            {parts.map((part) => (
              <li key={part.id} id={`piece-${part.id}`} className="flex scroll-mt-24 items-start gap-3 border-t py-3 first:border-t-0">
                <CategoryTile icon={null} piece photoFileId={part.photoFileId} className="size-10" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-bold">{part.name}</span>
                  <span className="text-xs font-medium text-muted-foreground">{[[part.make, part.model].filter(Boolean).join(" "), part.serial && `SN ${part.serial}`].filter(Boolean).join(" · ") || "No model yet"}</span>
                  {part.warranty.tone !== "none" && (
                    <Chip tone={WARRANTY_TONE[part.warranty.tone]} className="self-start">
                      {part.warranty.text}
                    </Chip>
                  )}
                  {part.notes && <span className="text-sm whitespace-pre-line text-muted-foreground">{part.notes}</span>}
                </span>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Options for ${part.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-48">
                      <DropdownMenuItem onSelect={() => setEditing(part)}>
                        <Pencil /> Edit piece
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => {
                          if (!window.confirm(`Take ${part.name} off the kit? Its photo${part.documentCount ? " and documents" : ""} go too.`)) return;
                          void action.run(async () => (await api(`/assets/${assetId}/parts/${part.id}`, { method: "DELETE" }), window.location.reload()));
                        }}
                      >
                        <Trash2 /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">No pieces yet.{canManage ? " Add the batteries, charger and case that come with it." : ""}</p>
        )}
        {canManage && (
          <Button variant="outline" className="self-start" onClick={() => setEditing("new")}>
            <Plus /> Add piece
          </Button>
        )}
        <Alert variant="error">{action.error}</Alert>
      </div>
      {editing && <PartSheet assetId={assetId} part={editing === "new" ? null : editing} defaults={{ make: assetMake ?? "" }} onClose={() => setEditing(null)} />}
    </Section>
  );
}

export function PartSheet({ assetId, part, defaults, onClose }: { assetId: string; part: PartJson | null; defaults: { make: string }; onClose: () => void }) {
  const [form, setForm] = useState({
    name: part?.name ?? "",
    make: part?.make ?? defaults.make,
    model: part?.model ?? "",
    serial: part?.serial ?? "",
    warrantyEndsOn: part?.warrantyEndsOn ?? "",
    notes: part?.notes ?? "",
  });
  const [photo, setPhoto] = useState<string | null>(part?.photoFileId ?? null);
  const [uploading, setUploading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const action = useAction();
  const set = (changes: Partial<typeof form>) => setForm((current) => ({ ...current, ...changes }));
  const save = () =>
    void action.run(async () => {
      const body = { ...form, warrantyEndsOn: form.warrantyEndsOn || null, photoFileId: photo };
      await api(part ? `/assets/${assetId}/parts/${part.id}` : `/assets/${assetId}/parts`, { method: part ? "PUT" : "POST", body });
      window.location.reload();
    });
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        title={part ? "Edit piece" : "Add kit piece"}
        description={part ? undefined : "A piece with its own model, serial or warranty: a battery, the charger, the case."}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={action.busy || uploading || !form.name.trim()} onClick={save}>
              {part ? "Save" : "Add piece"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 px-2">
          <Field label="Name" placeholder="e.g. 5Ah battery" value={form.name} onChange={(event) => set({ name: event.target.value })} autoFocus />
          <div className="flex flex-wrap gap-2">
            {["Battery", "Charger", "Case", "Remote", "Blade"].map((name) => (
              <button key={name} type="button" onClick={() => set({ name })} className="min-h-touch rounded-full border border-input bg-card px-3 text-xs font-semibold hover:bg-muted">
                {name}
              </button>
            ))}
          </div>
          <Field label="Make" value={form.make} onChange={(event) => set({ make: event.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Model" placeholder="e.g. BL1850B" value={form.model} onChange={(event) => set({ model: event.target.value })} />
            <Field label="Serial" value={form.serial} onChange={(event) => set({ serial: event.target.value })} />
          </div>
          <Field label="Warranty ends" type="date" value={form.warrantyEndsOn} onChange={(event) => set({ warrantyEndsOn: event.target.value })} />
          <div className="flex flex-col gap-2">
            <Label>Photo</Label>
            <div className="flex items-center gap-3">
              {photo ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl(photo, "thumb")} alt="" className="size-20 rounded-lg object-cover" />
                  <button type="button" onClick={() => setPhoto(null)} className="absolute -top-2 -right-2 flex size-touch items-center justify-center rounded-full bg-card shadow" aria-label="Take the photo off">
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <Button type="button" variant="outline" disabled={uploading} onClick={() => picker.current?.click()}>
                  <Camera /> {uploading ? "Uploading…" : "Add photo"}
                </Button>
              )}
              <input
                ref={picker}
                type="file"
                accept="image/*"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  setUploading(true);
                  action.setError(null);
                  try {
                    setPhoto(await uploadPhoto(file));
                  } catch (failure) {
                    action.setError((failure as Error).message);
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </div>
          </div>
          <TextArea id="piece-notes" label="Notes (optional)" value={form.notes} onChange={(notes) => set({ notes })} />
          <Alert variant="error">{action.error}</Alert>
        </div>
      </SheetContent>
    </Sheet>
  );
}
