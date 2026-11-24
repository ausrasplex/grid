"use client";

// Brands (Clipsal, HPM, Beacon Lighting…): chips to filter by, and a sheet to
// add, rename and remove them. Moved here from the price book; the price book
// uses the chips too.
import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Alert, Button, Field, Input, Scroller, Section, Sheet, SheetContent, api, cn, useAction } from "@grid/ui";
import type { BrandJson } from "./shared";

/** "ALL", "none" (without a brand) or a brand's id. */
export type BrandFilter = string;

/** The Brands section: tap a brand to show only its things. */
export function BrandChips({
  brands,
  value,
  onChange,
  onManage,
  counts = true,
}: {
  brands: BrandJson[];
  value: BrandFilter;
  onChange: (value: BrandFilter) => void;
  /** Shown as "Edit brands" when given. */
  onManage?: () => void;
  /** Show how many materials each brand has. */
  counts?: boolean;
}) {
  if (!brands.length && !onManage) return null;
  const chips: { value: BrandFilter; label: string; count?: number }[] = [
    { value: "ALL", label: "All brands" },
    ...brands.map((brand) => ({ value: brand.id, label: brand.name, count: counts ? brand.materials : undefined })),
    { value: "none", label: "No brand" },
  ];
  return (
    <Section
      title="Brands"
      description={brands.length ? undefined : "Add the makes you buy (Clipsal, HPM, Beacon Lighting…) to sort your materials by brand."}
      actions={
        onManage && (
          <Button variant="outline" size="sm" onClick={onManage}>
            {brands.length ? <Pencil aria-hidden /> : <Plus aria-hidden />}
            {brands.length ? "Edit brands" : "Add brands"}
          </Button>
        )
      }
      flush
    >
      {brands.length > 0 && (
        <Scroller axis="x" className="flex gap-2 px-4 pb-4 sm:px-6" role="group" aria-label="Filter by brand">
          {chips.map((chip) => (
            <button
              key={chip.value}
              type="button"
              aria-pressed={chip.value === value}
              onClick={() => onChange(chip.value)}
              className={cn(
                "flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors",
                chip.value === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {chip.label}
              {chip.count !== undefined && <span className={cn("text-xs", chip.value === value ? "opacity-80" : "text-muted-foreground")}>{chip.count}</span>}
            </button>
          ))}
        </Scroller>
      )}
    </Section>
  );
}

/** Add, rename and remove brands. Removing one leaves its materials without a brand. */
export function BrandsSheet({ brands, onChanged, onClose }: { brands: BrandJson[]; onChanged: () => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const action = useAction();

  const add = async () => {
    if (!name.trim()) return;
    const result = await action.run(() => api("/materials/brands", { body: { name } }));
    if (result) {
      setName("");
      await onChanged();
    }
  };
  const rename = async () => {
    if (!renaming) return;
    const result = await action.run(() => api(`/materials/brands/${renaming.id}`, { method: "PUT", body: { name: renaming.name } }));
    if (result) {
      setRenaming(null);
      await onChanged();
    }
  };
  const remove = async (brand: BrandJson) => {
    const question = brand.materials
      ? `Remove ${brand.name}? Its ${brand.materials} ${brand.materials === 1 ? "material stays" : "materials stay"} in the list, without a brand.`
      : `Remove ${brand.name}?`;
    if (!confirm(question)) return;
    const result = await action.run(() => api(`/materials/brands/${brand.id}`, { method: "DELETE" }));
    if (result) await onChanged();
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title="Brands" description="The makes you buy. Pick one on each material.">
        <div className="flex flex-col gap-3 px-2">
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void add();
            }}
          >
            <div className="flex-1">
              <Field label="Add a brand" placeholder="e.g. Clipsal" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            </div>
            <Button type="submit" disabled={action.busy || !name.trim()}>
              <Plus aria-hidden />
              Add
            </Button>
          </form>
          <Alert variant="error">{action.error}</Alert>
          {brands.length === 0 ? (
            <p className="px-1 py-4 text-sm text-muted-foreground">No brands yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {brands.map((brand) => (
                <li key={brand.id} className="flex min-h-touch-lg items-center gap-2 rounded-lg bg-muted py-2 pr-2 pl-3">
                  {renaming?.id === brand.id ? (
                    <form
                      className="flex flex-1 items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void rename();
                      }}
                    >
                      <Input aria-label={`New name for ${brand.name}`} value={renaming.name} onChange={(event) => setRenaming({ id: brand.id, name: event.target.value })} autoFocus />
                      <Button type="submit" size="icon" variant="ghost" aria-label="Save the name" disabled={action.busy || !renaming.name.trim()}>
                        <Check aria-hidden />
                      </Button>
                    </form>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{brand.name}</span>
                        <span className="block text-sm text-muted-foreground">
                          {brand.materials} {brand.materials === 1 ? "material" : "materials"}
                        </span>
                      </span>
                      <Button size="icon" variant="ghost" aria-label={`Rename ${brand.name}`} onClick={() => setRenaming({ id: brand.id, name: brand.name })}>
                        <Pencil aria-hidden />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Remove ${brand.name}`} disabled={action.busy} onClick={() => void remove(brand)}>
                        <Trash2 aria-hidden />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
