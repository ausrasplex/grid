"use client";

// The price book: labour rates and materials you quote often. Prices here
// are ex tax; a quote typed incl. tax converts them when you add a line.
// Brands (Clipsal, HPM…) are a list per business: materials pick one, and
// the Brands section filters by it (docs/quotations-block.md §2).
import { useEffect, useState } from "react";
import { Check, FileSpreadsheet, Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  ActionButton,
  Alert,
  Button,
  Checkbox,
  EmptyState,
  Field,
  FormActions,
  Input,
  List,
  PageHeader,
  Scroller,
  SearchInput,
  Section,
  Segmented,
  SelectField,
  Sheet,
  SheetContent,
  Stack,
  TapRow,
  api,
  buttonVariants,
  cn,
  useAction,
} from "@grid/ui";
import { formatMoney } from "../money";

export interface PriceItemRow {
  id: string;
  kind: "LABOUR" | "MATERIAL";
  name: string;
  unit: string;
  cost: number | null;
  sell: number;
  taxCodeId: string | null;
  supplier: string | null;
  supplierCode: string | null;
  brandId: string | null;
  brand: string | null;
  favourite: boolean;
}

export interface BrandRow {
  id: string;
  name: string;
  /** How many price book items use it. */
  items: number;
}

/** "ALL", "none" (items without a brand) or a brand's id. */
type BrandFilter = string;

type Codes = { id: string; name: string; active: boolean }[];

export function PriceBook({
  initial,
  initialBrands,
  codes,
  defaultTaxCodeId,
  taxName,
  currency,
  locale,
  canManage,
  canSeeCosts,
  canImport,
}: {
  initial: PriceItemRow[];
  initialBrands: BrandRow[];
  codes: Codes;
  defaultTaxCodeId: string | null;
  taxName: string;
  currency: string;
  locale: string;
  canManage: boolean;
  canSeeCosts: boolean;
  /** Import a supplier's price list (needs changing the price book and seeing costs). */
  canImport: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [kind, setKind] = useState<"ALL" | "LABOUR" | "MATERIAL">("ALL");
  const [query, setQuery] = useState("");
  const [brands, setBrands] = useState(initialBrands);
  const [brand, setBrand] = useState<BrandFilter>("ALL");
  const [editing, setEditing] = useState<Partial<PriceItemRow> | null>(null);
  const [managingBrands, setManagingBrands] = useState(false);

  const load = async () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (kind !== "ALL") params.set("kind", kind);
    if (brand !== "ALL") params.set("brand", brand);
    setRows(await api<PriceItemRow[]>(`/quotes/items?${params}`));
  };
  const loadBrands = async () => {
    const next = await api<BrandRow[]>("/quotes/brands");
    setBrands(next);
    // The brand being filtered by was removed: show everything again.
    if (brand !== "ALL" && brand !== "none" && !next.some((entry) => entry.id === brand)) setBrand("ALL");
  };
  useEffect(() => {
    const timer = setTimeout(() => void load().catch(() => {}), 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, kind, brand]);

  const money = (dollars: number) => formatMoney(Math.round(dollars * 100), currency, locale);
  return (
    <>
      <PageHeader
        title="Price book"
        subtitle={`Labour rates and materials you quote often. Prices are ex ${taxName}. Starred items come first.`}
        actions={
          canManage && (
            <>
              {canImport && (
                <a href="/quotes/price-book/import" className={buttonVariants({ variant: "outline" })}>
                  <FileSpreadsheet /> <span className="hidden sm:inline">Import price list</span>
                  <span className="sm:hidden">Import</span>
                </a>
              )}
              <ActionButton icon={<Plus />} label="Add item" onClick={() => setEditing({ kind: kind === "MATERIAL" ? "MATERIAL" : "LABOUR" })} />
            </>
          )
        }
      />
      <Stack>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Segmented
            label="Kind"
            value={kind}
            onChange={setKind}
            items={[
              { value: "ALL", label: "All" },
              { value: "LABOUR", label: "Labour" },
              { value: "MATERIAL", label: "Materials" },
            ]}
          />
          <SearchInput label="Search the price book" placeholder="Name, brand, supplier or code" value={query} onChange={(event) => setQuery(event.target.value)} className="flex-1" />
        </div>
        <BrandsSection brands={brands} value={brand} onChange={setBrand} canManage={canManage} onManage={() => setManagingBrands(true)} />
        <Section flush>
          {rows.length === 0 ? (
            <EmptyState title={query || brand !== "ALL" ? "Nothing matches" : "Your price book is empty"}>
              {!query && brand === "ALL" && canManage && "Add your hourly rate and the materials you use most, then add them to quotes with a tap."}
            </EmptyState>
          ) : (
            <List>
              {rows.map((row) => (
                <TapRow
                  key={row.id}
                  leading={row.favourite ? <Star aria-label="Starred" className="size-4 shrink-0 fill-current text-warning" /> : <span className="size-4 shrink-0" />}
                  title={row.name}
                  meta={`${row.kind === "LABOUR" ? "Labour" : "Material"} · ${money(row.sell)} / ${row.unit}${canSeeCosts && row.cost != null ? ` · cost ${money(row.cost)}` : ""}${row.brand ? ` · ${row.brand}` : ""}${row.supplier ? ` · ${row.supplier}` : ""}`}
                  onClick={() => canManage && setEditing(row)}
                />
              ))}
            </List>
          )}
        </Section>
      </Stack>
      {editing && (
        <ItemSheet
          item={editing}
          brands={brands}
          codes={codes}
          defaultTaxCodeId={defaultTaxCodeId}
          taxName={taxName}
          canSeeCosts={canSeeCosts}
          onClose={() => setEditing(null)}
          onSaved={async () => (setEditing(null), await Promise.all([load(), loadBrands()]))}
        />
      )}
      {managingBrands && <BrandsSheet brands={brands} onChanged={async () => void (await Promise.all([loadBrands(), load()]))} onClose={() => setManagingBrands(false)} />}
    </>
  );
}

function ItemSheet({
  item,
  brands,
  codes,
  defaultTaxCodeId,
  taxName,
  canSeeCosts,
  onClose,
  onSaved,
}: {
  item: Partial<PriceItemRow>;
  brands: BrandRow[];
  codes: Codes;
  defaultTaxCodeId: string | null;
  taxName: string;
  canSeeCosts: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    kind: item.kind ?? "LABOUR",
    name: item.name ?? "",
    unit: item.unit ?? (item.kind === "MATERIAL" ? "each" : "hr"),
    cost: item.cost == null ? "" : String(item.cost),
    markup: "",
    sell: item.sell == null ? "" : String(item.sell),
    taxCodeId: item.taxCodeId ?? defaultTaxCodeId ?? "",
    supplier: item.supplier ?? "",
    supplierCode: item.supplierCode ?? "",
    brandId: item.brandId ?? "",
    newBrand: "",
    favourite: item.favourite ?? false,
  });
  const action = useAction();
  const toNumber = (text: string) => (text.trim() === "" ? null : Number(text.replace(/[$,\s]/g, "")));
  const applyMarkup = (markup: string, cost = form.cost) => {
    const costValue = toNumber(cost);
    const markupPercent = toNumber(markup);
    return costValue != null && markupPercent != null && Number.isFinite(costValue) && Number.isFinite(markupPercent) ? (Math.round(costValue * (1 + markupPercent / 100) * 100) / 100).toFixed(2) : form.sell;
  };
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title={item.id ? "Price book item" : "New price book item"}>
        <form
          className="flex flex-col gap-3 px-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const material = form.kind === "MATERIAL";
            const body = {
              kind: form.kind,
              name: form.name,
              unit: form.unit || "each",
              cost: canSeeCosts ? toNumber(form.cost) : (item.cost ?? null),
              sell: toNumber(form.sell) ?? 0,
              taxCodeId: form.taxCodeId || null,
              supplier: form.supplier,
              supplierCode: form.supplierCode,
              brandId: material && form.brandId !== NEW_BRAND ? form.brandId || null : null,
              favourite: form.favourite,
            };
            const result = await action.run(async () => {
              // "Add a new brand…" in the list: make the brand first, then use it.
              if (material && form.brandId === NEW_BRAND && form.newBrand.trim()) {
                body.brandId = (await api<{ id: string }>("/quotes/brands", { body: { name: form.newBrand } })).id;
              }
              return item.id ? api(`/quotes/items/${item.id}`, { method: "PUT", body }) : api("/quotes/items", { body });
            });
            if (result) onSaved();
          }}
        >
          <Segmented
            label="Kind"
            value={form.kind}
            onChange={(kind) => setForm({ ...form, kind, unit: form.unit === "hr" || form.unit === "each" ? (kind === "LABOUR" ? "hr" : "each") : form.unit })}
            items={[
              { value: "LABOUR", label: "Labour" },
              { value: "MATERIAL", label: "Material" },
            ]}
          />
          <Field label="Name" placeholder={form.kind === "LABOUR" ? "e.g. Electrician" : "e.g. Double GPO, white"} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoFocus={!item.id} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit" placeholder="hr, each, m" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
            {canSeeCosts && (
              <Field label="Your cost" inputMode="decimal" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value, sell: form.markup ? applyMarkup(form.markup, event.target.value) : form.sell })} />
            )}
            {canSeeCosts && <Field label="Markup %" inputMode="decimal" placeholder="e.g. 30" value={form.markup} onChange={(event) => setForm({ ...form, markup: event.target.value, sell: applyMarkup(event.target.value) })} />}
            <Field label={`Sell price ex ${taxName}`} inputMode="decimal" value={form.sell} onChange={(event) => setForm({ ...form, sell: event.target.value })} required />
          </div>
          <SelectField label="Tax" value={form.taxCodeId} onChange={(event) => setForm({ ...form, taxCodeId: event.target.value })} options={[{ value: "", label: "No tax" }, ...codes.filter((code) => code.active).map((code) => ({ value: code.id, label: code.name }))]} />
          {form.kind === "MATERIAL" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Brand"
                value={form.brandId}
                onChange={(event) => setForm({ ...form, brandId: event.target.value })}
                options={[{ value: "", label: "No brand" }, ...brands.map((entry) => ({ value: entry.id, label: entry.name })), { value: NEW_BRAND, label: "Add a new brand…" }]}
              />
              {form.brandId === NEW_BRAND && (
                <Field label="New brand" placeholder="e.g. Clipsal" value={form.newBrand} onChange={(event) => setForm({ ...form, newBrand: event.target.value })} required autoFocus />
              )}
            </div>
          )}
          {form.kind === "MATERIAL" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Supplier" value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} />
              <Field label="Supplier code" value={form.supplierCode} onChange={(event) => setForm({ ...form, supplierCode: event.target.value })} />
            </div>
          )}
          <label className="flex items-center gap-3">
            <Checkbox checked={form.favourite} onCheckedChange={(checked) => setForm({ ...form, favourite: checked === true })} />
            <span>Star it (shows first when quoting)</span>
          </label>
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            {item.id && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={async () => {
                  const result = await action.run(() => api(`/quotes/items/${item.id}`, { method: "DELETE" }));
                  if (result) onSaved();
                }}
              >
                Remove
              </Button>
            )}
            <Button type="submit" disabled={action.busy}>
              {action.busy ? "Saving…" : "Save"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

const NEW_BRAND = "__new";

/** The Brands section: tap a brand to show only its items. */
function BrandsSection({
  brands,
  value,
  onChange,
  canManage,
  onManage,
}: {
  brands: BrandRow[];
  value: BrandFilter;
  onChange: (value: BrandFilter) => void;
  canManage: boolean;
  onManage: () => void;
}) {
  if (!brands.length && !canManage) return null;
  const chips: { value: BrandFilter; label: string; count?: number }[] = [
    { value: "ALL", label: "All brands" },
    ...brands.map((brand) => ({ value: brand.id, label: brand.name, count: brand.items })),
    { value: "none", label: "No brand" },
  ];
  return (
    <Section
      title="Brands"
      description={brands.length ? undefined : "Add the makes you buy (Clipsal, HPM, Schneider…) to sort your materials by brand."}
      actions={
        canManage && (
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

/** Add, rename and remove brands. Removing one leaves its items in the price book without a brand. */
function BrandsSheet({ brands, onChanged, onClose }: { brands: BrandRow[]; onChanged: () => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const action = useAction();

  const add = async () => {
    if (!name.trim()) return;
    const result = await action.run(() => api("/quotes/brands", { body: { name } }));
    if (result) {
      setName("");
      await onChanged();
    }
  };
  const rename = async () => {
    if (!renaming) return;
    const result = await action.run(() => api(`/quotes/brands/${renaming.id}`, { method: "PUT", body: { name: renaming.name } }));
    if (result) {
      setRenaming(null);
      await onChanged();
    }
  };
  const remove = async (brand: BrandRow) => {
    const question = brand.items
      ? `Remove ${brand.name}? Its ${brand.items} ${brand.items === 1 ? "item stays" : "items stay"} in the price book, without a brand.`
      : `Remove ${brand.name}?`;
    if (!confirm(question)) return;
    const result = await action.run(() => api(`/quotes/brands/${brand.id}`, { method: "DELETE" }));
    if (result) await onChanged();
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title="Brands" description="The makes you buy. Pick one on each material in the price book.">
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
                          {brand.items} {brand.items === 1 ? "item" : "items"}
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
