"use client";

// Add or change a material (docs/materials-block.md §1). Used on the
// Materials page and wherever a material is picked ("Add a new material…").
import { useId, useRef, useState } from "react";
import { Camera, ImageIcon, Palette, Trash2 } from "lucide-react";
import { Alert, Button, Field, FormActions, Label, Segmented, SelectField, Sheet, SheetContent, api, useAction, useApi } from "@grid/ui";
import { MATERIAL_TRADES } from "../trades";
import { cleanSwatch, materialMeta } from "../words";
import { MaterialPicture, photoUrl, uploadPhoto, type BrandJson, type MaterialJson } from "./shared";

interface Suggestions {
  trade: string;
  itemTypes: string[];
  finishes: string[];
  families: string[];
}

const NEW_BRAND = "__new";

export function MaterialSheet({
  material,
  onClose,
  onSaved,
  onOpen,
}: {
  /** The material to change, or what to start a new one with (e.g. the typed name). */
  material: Partial<MaterialJson>;
  onClose: () => void;
  onSaved: (material: MaterialJson) => void;
  /** Open another material instead (the one this looks the same as). */
  onOpen?: (material: MaterialJson) => void;
}) {
  const suggestions = useApi<Suggestions>("/materials/suggestions");
  const brands = useApi<BrandJson[]>("/materials/brands");
  const [form, setForm] = useState({
    name: material.name ?? "",
    itemType: material.itemType ?? "",
    brandId: material.brandId ?? "",
    newBrand: "",
    family: material.family ?? "",
    model: material.model ?? "",
    finish: material.finish ?? "",
    size: material.size ?? "",
    link: material.link ?? "",
    trade: material.trade ?? "",
    notes: material.notes ?? "",
  });
  const [picture, setPicture] = useState<"photo" | "colour">(material.swatch && !material.photoFileId ? "colour" : "photo");
  const [photoFileId, setPhotoFileId] = useState<string | null>(material.photoFileId ?? null);
  const [swatch, setSwatch] = useState(material.swatch ?? "");
  const [uploading, setUploading] = useState(false);
  const [same, setSame] = useState<MaterialJson | null>(null);
  const action = useAction();
  const ids = useId();
  const set = (changes: Partial<typeof form>) => {
    setForm({ ...form, ...changes });
    setSame(null);
  };
  const trade = form.trade || suggestions.data?.trade || "other";

  const save = async (anyway: boolean) => {
    const result = await action.run(async () => {
      let brandId = form.brandId === NEW_BRAND ? null : form.brandId || null;
      // Grid warns about a material that looks the same, but doesn't stop you.
      if (!anyway && form.brandId !== NEW_BRAND) {
        const params = new URLSearchParams({ name: form.name });
        if (brandId) params.set("brandId", brandId);
        if (form.model.trim()) params.set("model", form.model);
        if (form.finish.trim()) params.set("finish", form.finish);
        if (material.id) params.set("not", material.id);
        const found = await api<MaterialJson | null>(`/materials/same?${params}`);
        if (found) return { same: found };
      }
      if (form.brandId === NEW_BRAND && form.newBrand.trim()) brandId = (await api<{ id: string }>("/materials/brands", { body: { name: form.newBrand } })).id;
      const body = {
        name: form.name,
        itemType: form.itemType,
        brandId,
        family: form.family,
        model: form.model,
        finish: form.finish,
        size: form.size,
        link: form.link,
        trade,
        photoFileId: picture === "photo" ? photoFileId : null,
        swatch: picture === "colour" ? cleanSwatch(swatch) : null,
        notes: form.notes,
      };
      const saved = await (material.id ? api<MaterialJson>(`/materials/${material.id}`, { method: "PUT", body }) : api<MaterialJson>("/materials", { body }));
      return { saved };
    });
    if (result && "same" in result) setSame(result.same ?? null);
    else if (result?.saved) onSaved(result.saved);
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title={material.id ? "Change material" : "New material"}>
        <form
          className="flex flex-col gap-3 px-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save(false);
          }}
        >
          <Segmented
            label="Picture"
            value={picture}
            onChange={setPicture}
            items={[
              { value: "photo", label: "Photo" },
              { value: "colour", label: "Colour" },
            ]}
          />
          {picture === "photo" ? (
            <PhotoPicker
              fileId={photoFileId}
              busy={uploading}
              onUploading={setUploading}
              onChange={setPhotoFileId}
              onError={action.setError}
            />
          ) : (
            <SwatchPicker value={swatch} onChange={setSwatch} />
          )}
          <Field label="Name" placeholder="e.g. Masson Accent Minitrim LED Downlight" value={form.name} onChange={(event) => set({ name: event.target.value })} required autoFocus={!material.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Item type"
              placeholder="e.g. Downlight"
              hint="The short word the client knows."
              list={`${ids}-types`}
              value={form.itemType}
              onChange={(event) => set({ itemType: event.target.value })}
            />
            <SelectField
              label="Trade"
              value={trade}
              onChange={(event) => set({ trade: event.target.value })}
              options={MATERIAL_TRADES.map((option) => ({ value: option.id, label: option.name }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Brand"
              value={form.brandId}
              onChange={(event) => set({ brandId: event.target.value })}
              options={[{ value: "", label: "No brand" }, ...(brands.data ?? []).map((entry) => ({ value: entry.id, label: entry.name })), { value: NEW_BRAND, label: "Add a new brand…" }]}
            />
            {form.brandId === NEW_BRAND ? (
              <Field label="New brand" placeholder="e.g. Clipsal" value={form.newBrand} onChange={(event) => set({ newBrand: event.target.value })} required autoFocus />
            ) : (
              <Field label="Model" placeholder="e.g. 3042" value={form.model} onChange={(event) => set({ model: event.target.value })} />
            )}
          </div>
          {form.brandId === NEW_BRAND && <Field label="Model" placeholder="e.g. 3042" value={form.model} onChange={(event) => set({ model: event.target.value })} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Colour / finish" placeholder="e.g. White with warm white bulb" list={`${ids}-finishes`} value={form.finish} onChange={(event) => set({ finish: event.target.value })} />
            <Field label="Size" placeholder="e.g. 90 mm cut-out" value={form.size} onChange={(event) => set({ size: event.target.value })} />
          </div>
          <Field
            label="Family"
            placeholder="e.g. Iconic double switch"
            hint="Link the same item in other finishes by giving them the same family."
            list={`${ids}-families`}
            value={form.family}
            onChange={(event) => set({ family: event.target.value })}
          />
          <Field label="Link" inputMode="url" autoCapitalize="none" placeholder="The product's web page" value={form.link} onChange={(event) => set({ link: event.target.value })} />
          <label className="flex flex-col gap-2 text-sm font-medium lg:max-w-2xl">
            Notes
            <textarea rows={2} value={form.notes} onChange={(event) => set({ notes: event.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-base font-normal" />
          </label>
          <datalist id={`${ids}-types`}>{suggestions.data?.itemTypes.map((value) => <option key={value} value={value} />)}</datalist>
          <datalist id={`${ids}-finishes`}>{suggestions.data?.finishes.map((value) => <option key={value} value={value} />)}</datalist>
          <datalist id={`${ids}-families`}>{suggestions.data?.families.map((value) => <option key={value} value={value} />)}</datalist>
          {same && (
            <Alert>
              <span className="flex flex-col gap-3">
                <span className="flex items-center gap-3">
                  <MaterialPicture material={same} className="size-10" />
                  <span className="min-w-0">
                    <span className="block font-semibold">Already in Materials: {same.name}</span>
                    <span className="block text-sm text-muted-foreground">{materialMeta(same) || "Same name, no brand or model"}</span>
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {onOpen && (
                    <Button type="button" variant="outline" onClick={() => onOpen(same)}>
                      Open it
                    </Button>
                  )}
                  <Button type="button" variant="outline" disabled={action.busy} onClick={() => void save(true)}>
                    Save anyway
                  </Button>
                </span>
              </span>
            </Alert>
          )}
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            {material.id && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={action.busy}
                onClick={async () => {
                  if (!confirm(`Remove ${material.name} from Materials? Price list items and jobs that use it keep it.`)) return;
                  const result = await action.run(() => api(`/materials/${material.id}`, { method: "DELETE" }));
                  if (result) onSaved({ ...(material as MaterialJson), removed: true });
                }}
              >
                <Trash2 aria-hidden /> Remove
              </Button>
            )}
            <Button type="submit" size="lg" disabled={action.busy || uploading}>
              {action.busy ? "Saving…" : "Save"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Take a photo of the product (or pick one, e.g. saved from the maker's site). */
function PhotoPicker({
  fileId,
  busy,
  onUploading,
  onChange,
  onError,
}: {
  fileId: string | null;
  busy: boolean;
  onUploading: (busy: boolean) => void;
  onChange: (fileId: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      <input
        ref={picker}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          onUploading(true);
          onError(null);
          try {
            onChange(await uploadPhoto(file));
          } catch (failure) {
            onError((failure as Error).message);
          } finally {
            onUploading(false);
          }
        }}
      />
      <button
        type="button"
        onClick={() => picker.current?.click()}
        className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-input bg-muted/40 hover:bg-muted"
        aria-label={fileId ? "Change the photo" : "Add a photo"}
      >
        {busy ? (
          <span className="text-sm text-muted-foreground">Uploading…</span>
        ) : fileId ? (
          <img src={photoUrl(fileId, "thumb")} alt="" className="size-full object-cover" />
        ) : (
          <Camera aria-hidden className="size-7 text-muted-foreground" />
        )}
      </button>
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" onClick={() => picker.current?.click()} disabled={busy}>
          <ImageIcon aria-hidden /> {fileId ? "Change photo" : "Add a photo"}
        </Button>
        {fileId && (
          <Button type="button" variant="ghost" onClick={() => onChange(null)} disabled={busy}>
            Take the photo off
          </Button>
        )}
      </div>
    </div>
  );
}

/** A colour instead of a photo (paint and other finishes). */
function SwatchPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  const colour = cleanSwatch(value);
  return (
    <div className="flex items-end gap-3">
      <label
        htmlFor={`${id}-picker`}
        className="flex size-28 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-input bg-muted/40"
        // The business's own colour, shown as is.
        style={colour ? { backgroundColor: colour, borderStyle: "solid" } : undefined}
      >
        {!colour && <Palette aria-hidden className="size-7 text-muted-foreground" />}
        <input id={`${id}-picker`} type="color" className="sr-only" value={colour ?? "#ffffff"} onChange={(event) => onChange(event.target.value)} />
      </label>
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor={`${id}-hex`}>Colour code</Label>
        <input
          id={`${id}-hex`}
          value={value}
          placeholder="#1f2937"
          onChange={(event) => onChange(event.target.value)}
          className="h-touch w-full rounded-md border border-input bg-background px-3 text-base"
        />
        <p className="text-sm text-muted-foreground">Tap the square to pick, or type the code.</p>
      </div>
    </div>
  );
}
