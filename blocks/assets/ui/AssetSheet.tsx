"use client";

// Add or edit an asset (docs/assets-block.md §1, "What part 4b built"),
// laid out like Docket's Add Item drawer: a panel from the right on a
// computer or tablet, a sheet from the bottom on a phone, with Cancel and
// Save pinned at the bottom. Name and category first; then Make and model,
// Dates and warranty (with +1, +2, +3, +5 years), Value, the barcode it
// already has, and the Track tests and servicing / Track kit pieces
// switches.
import { useEffect, useId, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Alert, Button, Field, Label, SelectField, Sheet, SheetContent, Switch, api, cn, useAction } from "@grid/ui";
import { SubHeading, TextArea, photoUrl, uploadPhoto, type AssetJson, type CategoryField, type CategoryJson, type FieldValue } from "./shared";

export function Photos({ ids, onChange, onError, label = "Photos" }: { ids: string[]; onChange: (ids: string[]) => void; onError: (message: string | null) => void; label?: string }) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {ids.map((id, index) => (
          <div key={id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(id, "thumb")} alt={index === 0 ? "Main photo" : ""} className="size-24 rounded-lg object-cover" />
            <button type="button" onClick={() => onChange(ids.filter((entry) => entry !== id))} className="absolute -top-2 -right-2 flex size-touch items-center justify-center rounded-full bg-card shadow" aria-label="Take this photo off">
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

/** A switch with a bold line and an explanation under it (Docket's Track Servicing / Track Parts boxes). */
export function SwitchBox({ title, detail, checked, disabled, onChange }: { title: string; detail: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={cn("flex min-h-touch-lg shrink-0 items-center gap-3 rounded-xl bg-muted px-3.5 py-3", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
      <span className="flex flex-col gap-0.5">
        <b className="text-sm">{title}</b>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}

/** The make, with the business's brands to pick from as you type (they're shared with Materials). */
function MakeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const list = useId();
  const [brands, setBrands] = useState<string[]>([]);
  useEffect(() => {
    void api<{ name: string }[]>("/materials/brands")
      .then((rows) => setBrands(rows.map((row) => row.name)))
      .catch(() => {});
  }, []);
  return (
    <>
      <Field label="Make" placeholder="e.g. Makita" list={list} value={value} onChange={(event) => onChange(event.target.value)} hint="Its support site and phone number are set once on the brand." />
      <datalist id={list}>
        {brands.map((brand) => (
          <option key={brand} value={brand} />
        ))}
      </datalist>
    </>
  );
}

const plusYears = (from: string, years: number) => {
  const date = new Date(`${from}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
};

export function AssetSheet({ asset, categories, onClose, onSaved }: { asset: Partial<AssetJson>; categories: CategoryJson[]; onClose: () => void; onSaved: (asset: AssetJson) => void }) {
  const [form, setForm] = useState({
    name: asset.name ?? "",
    number: asset.number ? String(asset.number) : "",
    categoryId: asset.categoryId ?? "",
    make: asset.make ?? "",
    model: asset.model ?? "",
    serial: asset.serial ?? "",
    productUrl: asset.productUrl ?? "",
    supplier: asset.supplier ?? "",
    purchasedOn: asset.purchasedOn ?? "",
    warrantyEndsOn: asset.warrantyEndsOn ?? "",
    purchasePrice: asset.purchasePrice ?? "",
    replacementValue: asset.replacementValue ?? "",
    barcode: asset.barcode ?? "",
    notes: asset.notes ?? "",
    serviceEnabled: asset.serviceEnabled ?? true,
    partsEnabled: asset.partsEnabled ?? false,
  });
  const [photos, setPhotos] = useState<string[]>(asset.photoFileIds ?? []);
  const [values, setValues] = useState<Record<string, FieldValue>>(asset.fields ?? {});
  const [hint, setHint] = useState<string | null>(null);
  const action = useAction();
  const set = (changes: Partial<typeof form>) => setForm((current) => ({ ...current, ...changes }));
  const category = categories.find((entry) => entry.id === form.categoryId);
  const categoryRoutines = category?.routines.length ?? 0;
  const pieces = asset.partCount ?? 0;

  const save = () =>
    void action.run(async () => {
      const body = {
        name: form.name,
        number: form.number.trim() ? Number(form.number) : null,
        categoryId: form.categoryId || null,
        make: form.make,
        model: form.model,
        serial: form.serial,
        productUrl: form.productUrl,
        supplier: form.supplier,
        purchasedOn: form.purchasedOn || null,
        warrantyEndsOn: form.warrantyEndsOn || null,
        purchasePrice: form.purchasePrice,
        replacementValue: form.replacementValue,
        photoFileIds: photos,
        notes: form.notes,
        fields: values,
        barcode: form.barcode,
        serviceEnabled: form.serviceEnabled,
        partsEnabled: form.partsEnabled,
      };
      onSaved(await (asset.id ? api<AssetJson>(`/assets/${asset.id}`, { method: "PUT", body }) : api<AssetJson>("/assets", { body })));
    });

  /** Warranty end from the date bought plus so many years. */
  const addYears = (years: number) => {
    if (!form.purchasedOn) return setHint("Add the date it was bought first");
    setHint(null);
    set({ warrantyEndsOn: plusYears(form.purchasedOn, years) });
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        title={asset.id ? "Edit asset" : "Add asset"}
        description={asset.id ? undefined : "A tool, a piece of gear or equipment worth keeping track of."}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={action.busy || !form.name.trim()} onClick={save}>
              {action.busy ? "Saving…" : asset.id ? "Save" : "Add asset"}
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <Field label="Name" placeholder="e.g. Makita 18V drill" value={form.name} onChange={(event) => set({ name: event.target.value })} required autoFocus={!asset.id} />
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Category"
              value={form.categoryId || "none"}
              onChange={(event) => set({ categoryId: event.target.value === "none" ? "" : event.target.value })}
              options={[{ value: "none", label: "No category" }, ...categories.map((entry) => ({ value: entry.id, label: entry.name }))]}
            />
            <Field label="Asset No." inputMode="numeric" placeholder={asset.id ? undefined : "Next number"} value={form.number} onChange={(event) => set({ number: event.target.value.replace(/\D/g, "") })} />
          </div>
          <p className="-mt-2 text-sm text-muted-foreground">{asset.id ? "Changing the number means printing a new sticker." : "Leave the number blank for the next one, or match a sticker you already use."}</p>
          {category?.fields.map((field) => <CustomField key={field.key} field={field} value={values[field.key]} onChange={(value) => setValues({ ...values, [field.key]: value })} />)}
          <Photos ids={photos} onChange={setPhotos} onError={action.setError} />

          <SubHeading title="Make and model" />
          <MakeField value={form.make} onChange={(make) => set({ make })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Model" placeholder="e.g. DHP486" value={form.model} onChange={(event) => set({ model: event.target.value })} />
            <Field label="Serial" value={form.serial} onChange={(event) => set({ serial: event.target.value })} />
          </div>
          <Field label="Product page (optional)" inputMode="url" placeholder="makita.com.au/products/…" value={form.productUrl} onChange={(event) => set({ productUrl: event.target.value })} hint="This exact model on the maker's site." />
          <Field label="Where bought" placeholder="e.g. Total Tools, Middy's" value={form.supplier} onChange={(event) => set({ supplier: event.target.value })} />

          <SubHeading title="Dates and warranty" />
          <Field label="Bought" type="date" value={form.purchasedOn} onChange={(event) => set({ purchasedOn: event.target.value })} />
          <Field label="Warranty ends" type="date" value={form.warrantyEndsOn} onChange={(event) => set({ warrantyEndsOn: event.target.value })} />
          <div className="-mt-2 flex flex-wrap gap-2">
            {[1, 2, 3, 5].map((years) => (
              <Button key={years} type="button" variant="outline" onClick={() => addYears(years)}>
                +{years} year{years > 1 ? "s" : ""}
              </Button>
            ))}
          </div>
          {hint && <p className="-mt-2 text-sm font-medium text-muted-foreground">{hint}</p>}

          <SubHeading title="Value" hint="Used by the asset register, for insurance and the accountant." />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price paid" inputMode="decimal" placeholder="$" value={form.purchasePrice} onChange={(event) => set({ purchasePrice: event.target.value })} />
            <Field label="Replacement cost" inputMode="decimal" placeholder="$" value={form.replacementValue} onChange={(event) => set({ replacementValue: event.target.value })} />
          </div>

          <SubHeading title="More" />
          <Field
            label="Barcode it already has"
            hint="An old asset sticker or the maker's barcode. Scanning it opens this asset, like its QR tag."
            value={form.barcode}
            onChange={(event) => set({ barcode: event.target.value })}
          />
          <SwitchBox
            title="Track tests and servicing"
            detail={
              categoryRoutines
                ? `Stays on while ${category!.name} has ${categoryRoutines === 1 ? "a routine" : `${categoryRoutines} routines`}, like test & tag.`
                : "Shows Inspections and servicing, for test & tag, inspections and regular care. Untick for gear that never needs it."
            }
            checked={form.serviceEnabled || categoryRoutines > 0}
            disabled={categoryRoutines > 0}
            onChange={(serviceEnabled) => set({ serviceEnabled })}
          />
          <SwitchBox
            title="Track kit pieces"
            detail={
              pieces
                ? `Stays on while it has ${pieces === 1 ? "a piece" : `${pieces} pieces`}. Remove them first to turn this off.`
                : "Shows Kit pieces, for the batteries, charger and case that come with it, each with its own serial and warranty."
            }
            checked={form.partsEnabled || pieces > 0}
            disabled={pieces > 0}
            onChange={(partsEnabled) => set({ partsEnabled })}
          />
          <TextArea id="asset-notes" label="Notes (optional)" value={form.notes} onChange={(notes) => set({ notes })} placeholder="Blade sizes, settings, quirks" />
          <Alert variant="error">{action.error}</Alert>
        </form>
      </SheetContent>
    </Sheet>
  );
}
