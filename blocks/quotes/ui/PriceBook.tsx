"use client";

// The price list: labour rates and materials you quote often. Prices here
// are ex tax; a quote typed incl. tax converts them when you add a line.
// A material item points at a material (Materials, core), which holds its
// name, brand, photo and finish; the price list adds the money
// (docs/materials-block.md "The price list adds the money").
import { useEffect, useState } from "react";
import { Plus, Star } from "lucide-react";
import { BrandChips, MaterialPicker, MaterialPicture, type BrandFilter, type BrandJson, type MaterialJson } from "@grid/block-materials/components";
import { materialMeta } from "@grid/block-materials/words";
import {
  ActionButton,
  Alert,
  Button,
  Checkbox,
  EmptyState,
  Field,
  FormActions,
  List,
  PageHeader,
  SearchInput,
  Section,
  Segmented,
  SelectField,
  Sheet,
  SheetContent,
  Stack,
  TapRow,
  api,
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
  favourite: boolean;
  /** A material item's material, with what lists show of it. */
  materialId: string | null;
  brand: string | null;
  model: string | null;
  photoFileId: string | null;
  swatch: string | null;
}

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
  canAddMaterials,
}: {
  initial: PriceItemRow[];
  initialBrands: BrandJson[];
  codes: Codes;
  defaultTaxCodeId: string | null;
  taxName: string;
  currency: string;
  locale: string;
  canManage: boolean;
  canSeeCosts: boolean;
  /** Can make new materials from here (materials.manage). */
  canAddMaterials: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [kind, setKind] = useState<"ALL" | "LABOUR" | "MATERIAL">("ALL");
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState<BrandFilter>("ALL");
  const [editing, setEditing] = useState<Partial<PriceItemRow> | null>(null);

  const load = async () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (kind !== "ALL") params.set("kind", kind);
    if (brand !== "ALL") params.set("brand", brand);
    setRows(await api<PriceItemRow[]>(`/quotes/items?${params}`));
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
        title="Price list"
        subtitle={`Labour rates and the prices of your materials. Prices are ex ${taxName}. Starred items come first. Photos, brands and finishes are kept in Settings › Materials.`}
        actions={canManage && <ActionButton icon={<Plus />} label="Add item" onClick={() => setEditing({ kind: kind === "MATERIAL" ? "MATERIAL" : "LABOUR" })} />}
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
          <SearchInput label="Search the price list" placeholder="Name, brand, model, supplier or code" value={query} onChange={(event) => setQuery(event.target.value)} className="flex-1" />
        </div>
        <BrandChips brands={initialBrands} value={brand} onChange={setBrand} counts={false} />
        <Section flush>
          {rows.length === 0 ? (
            <EmptyState title={query || brand !== "ALL" ? "Nothing matches" : "Your price list is empty"}>
              {!query && brand === "ALL" && canManage && "Add your hourly rate and the materials you use most, then add them to quotes with a tap."}
            </EmptyState>
          ) : (
            <List>
              {rows.map((row) => (
                <TapRow
                  key={row.id}
                  leading={
                    <span className="flex shrink-0 items-center gap-2">
                      {row.favourite ? <Star aria-label="Starred" className="size-4 shrink-0 fill-current text-warning" /> : <span className="size-4 shrink-0" />}
                      {row.kind === "MATERIAL" && <MaterialPicture material={row} className="size-10" />}
                    </span>
                  }
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
          codes={codes}
          defaultTaxCodeId={defaultTaxCodeId}
          taxName={taxName}
          canSeeCosts={canSeeCosts}
          canAddMaterials={canAddMaterials}
          onClose={() => setEditing(null)}
          onSaved={async () => (setEditing(null), await load())}
        />
      )}
    </>
  );
}

/** The material a material item is for: what the item sheet shows of it. */
type ChosenMaterial = Pick<MaterialJson, "id" | "name" | "photoFileId" | "swatch" | "brand" | "model" | "finish">;

function ItemSheet({
  item,
  codes,
  defaultTaxCodeId,
  taxName,
  canSeeCosts,
  canAddMaterials,
  onClose,
  onSaved,
}: {
  item: Partial<PriceItemRow>;
  codes: Codes;
  defaultTaxCodeId: string | null;
  taxName: string;
  canSeeCosts: boolean;
  canAddMaterials: boolean;
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
    favourite: item.favourite ?? false,
  });
  const [material, setMaterial] = useState<ChosenMaterial | null>(
    item.materialId ? { id: item.materialId, name: item.name ?? "", photoFileId: item.photoFileId ?? null, swatch: item.swatch ?? null, brand: item.brand ?? null, model: item.model ?? null, finish: null } : null,
  );
  // A new material item starts by picking its material.
  const [picking, setPicking] = useState(!item.id && item.kind === "MATERIAL");
  const action = useAction();
  const toNumber = (text: string) => (text.trim() === "" ? null : Number(text.replace(/[$,\s]/g, "")));
  const applyMarkup = (markup: string, cost = form.cost) => {
    const costValue = toNumber(cost);
    const markupPercent = toNumber(markup);
    return costValue != null && markupPercent != null && Number.isFinite(costValue) && Number.isFinite(markupPercent) ? (Math.round(costValue * (1 + markupPercent / 100) * 100) / 100).toFixed(2) : form.sell;
  };
  // Picking the material swaps this sheet for the picker; the form keeps what was typed.
  if (picking) {
    return (
      <MaterialPicker
        canAdd={canAddMaterials}
        onPick={(picked) => {
          setMaterial(picked);
          setPicking(false);
        }}
        onClose={() => {
          setPicking(false);
          // Closed without picking on a brand new material item: nothing to price.
          if (!material && !item.id) onClose();
        }}
      />
    );
  }
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title={item.id ? "Price list item" : "New price list item"}>
        <form
          className="flex flex-col gap-3 px-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const isMaterial = form.kind === "MATERIAL";
            if (isMaterial && !material) {
              setPicking(true);
              return;
            }
            const body = {
              kind: form.kind,
              name: isMaterial ? "" : form.name,
              materialId: isMaterial ? material!.id : null,
              unit: form.unit || "each",
              cost: canSeeCosts ? toNumber(form.cost) : (item.cost ?? null),
              sell: toNumber(form.sell) ?? 0,
              taxCodeId: form.taxCodeId || null,
              supplier: form.supplier,
              supplierCode: form.supplierCode,
              favourite: form.favourite,
            };
            const result = await action.run(() => (item.id ? api(`/quotes/items/${item.id}`, { method: "PUT", body }) : api("/quotes/items", { body })));
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
          {form.kind === "LABOUR" ? (
            <Field label="Name" placeholder="e.g. Electrician" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoFocus={!item.id} />
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Material</span>
              <button type="button" onClick={() => setPicking(true)} className="flex min-h-touch-lg w-full items-center gap-3 rounded-lg bg-muted px-3 py-2 text-left hover:bg-muted/70">
                {material ? (
                  <>
                    <MaterialPicture material={material} className="size-10" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{material.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">{materialMeta(material) || "Tap to pick another"}</span>
                    </span>
                    <span className="text-sm font-semibold text-primary">Change</span>
                  </>
                ) : (
                  <span className="font-semibold text-primary">Pick a material</span>
                )}
              </button>
            </div>
          )}
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
