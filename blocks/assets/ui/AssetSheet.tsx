"use client";

// Add or change an asset (docs/assets-block.md §1): photos, name, the
// friendly number (blank for the next), category and its own fields,
// make, model, serial, purchase date, a barcode it already had, notes.
import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Alert, Button, Field, FormActions, Label, SelectField, Sheet, SheetContent, Switch, api, useAction } from "@grid/ui";
import { photoUrl, uploadPhoto, type AssetJson, type CategoryField, type CategoryJson, type FieldValue } from "./shared";

export function Photos({ ids, onChange, onError }: { ids: string[]; onChange: (ids: string[]) => void; onError: (message: string | null) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Label>Photos</Label>
      <div className="flex flex-wrap gap-2">
        {ids.map((id, index) => (
          <div key={id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(id, "thumb")} alt={index === 0 ? "Main photo" : ""} className="size-24 rounded-lg object-cover" />
            <button type="button" onClick={() => onChange(ids.filter((entry) => entry !== id))} className="absolute -top-2 -right-2 flex size-8 items-center justify-center rounded-full bg-card shadow" aria-label="Take this photo off">
              <X className="size-4" />
            </button>
          </div>
        ))}
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={async (event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            if (!files.length) return;
            setBusy(true);
            onError(null);
            try {
              const added: string[] = [];
              for (const file of files) added.push(await uploadPhoto(file));
              onChange([...ids, ...added]);
            } catch (failure) {
              onError((failure as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
        <button
          type="button"
          onClick={() => picker.current?.click()}
          className="flex size-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-input bg-muted/40 text-sm text-muted-foreground hover:bg-muted"
        >
          <Camera className="size-5" />
          {busy ? "Uploading…" : "Add photo"}
        </button>
      </div>
      {ids.length > 1 && <p className="text-sm text-muted-foreground">The first photo shows on lists.</p>}
    </div>
  );
}

function CustomField({ field, value, onChange }: { field: CategoryField; value: FieldValue | undefined; onChange: (value: FieldValue) => void }) {
  if (field.type === "yesno") {
    return (
      <label className="flex min-h-touch items-center justify-between gap-3">
        <span className="text-sm font-medium">{field.label}</span>
        <Switch checked={value === true} onCheckedChange={(checked) => onChange(checked)} />
      </label>
    );
  }
  return (
    <Field
      label={field.label}
      type={field.type === "date" ? "date" : "text"}
      inputMode={field.type === "number" ? "decimal" : undefined}
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function AssetSheet({ asset, categories, onClose, onSaved }: { asset: Partial<AssetJson>; categories: CategoryJson[]; onClose: () => void; onSaved: (asset: AssetJson) => void }) {
  const [form, setForm] = useState({
    name: asset.name ?? "",
    number: asset.number ? String(asset.number) : "",
    categoryId: asset.categoryId ?? "",
    make: asset.make ?? "",
    model: asset.model ?? "",
    serial: asset.serial ?? "",
    purchasedOn: asset.purchasedOn ?? "",
    barcode: asset.barcode ?? "",
    notes: asset.notes ?? "",
  });
  const [photos, setPhotos] = useState<string[]>(asset.photoFileIds ?? []);
  const [values, setValues] = useState<Record<string, FieldValue>>(asset.fields ?? {});
  const action = useAction();
  const set = (changes: Partial<typeof form>) => setForm({ ...form, ...changes });
  const category = categories.find((entry) => entry.id === form.categoryId);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title={asset.id ? `Change Asset No. ${asset.number}` : "New asset"}>
        <form
          className="flex flex-col gap-3 px-2"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              const body = {
                name: form.name,
                number: form.number.trim() ? Number(form.number) : null,
                categoryId: form.categoryId || null,
                make: form.make,
                model: form.model,
                serial: form.serial,
                purchasedOn: form.purchasedOn || null,
                photoFileIds: photos,
                notes: form.notes,
                fields: values,
                barcode: form.barcode,
              };
              onSaved(await (asset.id ? api<AssetJson>(`/assets/${asset.id}`, { method: "PUT", body }) : api<AssetJson>("/assets", { body })));
            });
          }}
        >
          <Photos ids={photos} onChange={setPhotos} onError={action.setError} />
          <Field label="Name" placeholder="e.g. Makita 18V drill" value={form.name} onChange={(event) => set({ name: event.target.value })} required autoFocus={!asset.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Asset No."
              inputMode="numeric"
              placeholder={asset.id ? undefined : "Next number"}
              hint={asset.id ? "Changing it means printing a new sticker." : "Leave blank for the next one, or match a sticker you already use."}
              value={form.number}
              onChange={(event) => set({ number: event.target.value.replace(/\D/g, "") })}
            />
            <SelectField
              label="Category"
              value={form.categoryId || "none"}
              onChange={(event) => set({ categoryId: event.target.value === "none" ? "" : event.target.value })}
              options={[{ value: "none", label: "No category" }, ...categories.map((entry) => ({ value: entry.id, label: entry.name }))]}
            />
          </div>
          {category?.fields.map((field) => <CustomField key={field.key} field={field} value={values[field.key]} onChange={(value) => setValues({ ...values, [field.key]: value })} />)}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Make" placeholder="e.g. Makita" value={form.make} onChange={(event) => set({ make: event.target.value })} />
            <Field label="Model" placeholder="e.g. DHP486" value={form.model} onChange={(event) => set({ model: event.target.value })} />
            <Field label="Serial number" value={form.serial} onChange={(event) => set({ serial: event.target.value })} />
            <Field label="Bought" type="date" value={form.purchasedOn} onChange={(event) => set({ purchasedOn: event.target.value })} />
          </div>
          <Field
            label="Barcode it already has"
            hint="An old asset sticker or the maker's barcode. Scanning it opens this asset, like its QR tag."
            value={form.barcode}
            onChange={(event) => set({ barcode: event.target.value })}
          />
          <div className="flex flex-col gap-2 lg:max-w-2xl">
            <Label htmlFor="asset-notes">Notes</Label>
            <textarea id="asset-notes" rows={3} value={form.notes} onChange={(event) => set({ notes: event.target.value })} className="rounded-lg border border-input bg-card px-3 py-2 text-base" />
          </div>
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={action.busy || !form.name.trim()}>
              {action.busy ? "Saving…" : asset.id ? "Save" : "Add asset"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}
