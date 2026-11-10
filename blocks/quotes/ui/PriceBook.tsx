"use client";

// The price book: labour rates and materials you quote often. Prices here
// are ex tax; a quote typed incl. tax converts them when you add a line.
import { useEffect, useState } from "react";
import { Plus, Star } from "lucide-react";
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
}

type Codes = { id: string; name: string; active: boolean }[];

export function PriceBook({
  initial,
  codes,
  defaultTaxCodeId,
  taxName,
  currency,
  locale,
  canManage,
  canSeeCosts,
}: {
  initial: PriceItemRow[];
  codes: Codes;
  defaultTaxCodeId: string | null;
  taxName: string;
  currency: string;
  locale: string;
  canManage: boolean;
  canSeeCosts: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [kind, setKind] = useState<"ALL" | "LABOUR" | "MATERIAL">("ALL");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Partial<PriceItemRow> | null>(null);

  const load = async () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (kind !== "ALL") params.set("kind", kind);
    setRows(await api<PriceItemRow[]>(`/quotes/items?${params}`));
  };
  useEffect(() => {
    const timer = setTimeout(() => void load().catch(() => {}), 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, kind]);

  const money = (dollars: number) => formatMoney(Math.round(dollars * 100), currency, locale);
  return (
    <>
      <PageHeader
        title="Price book"
        subtitle={`Labour rates and materials you quote often. Prices are ex ${taxName}. Starred items come first.`}
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
          <SearchInput label="Search the price book" placeholder="Name, supplier or code" value={query} onChange={(event) => setQuery(event.target.value)} className="flex-1" />
        </div>
        <Section flush>
          {rows.length === 0 ? (
            <EmptyState title={query ? "Nothing matches" : "Your price book is empty"}>
              {!query && canManage && "Add your hourly rate and the materials you use most, then add them to quotes with a tap."}
            </EmptyState>
          ) : (
            <List>
              {rows.map((row) => (
                <TapRow
                  key={row.id}
                  leading={row.favourite ? <Star aria-label="Starred" className="size-4 shrink-0 fill-current text-warning" /> : <span className="size-4 shrink-0" />}
                  title={row.name}
                  meta={`${row.kind === "LABOUR" ? "Labour" : "Material"} · ${money(row.sell)} / ${row.unit}${canSeeCosts && row.cost != null ? ` · cost ${money(row.cost)}` : ""}${row.supplier ? ` · ${row.supplier}` : ""}`}
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
          onClose={() => setEditing(null)}
          onSaved={async () => (setEditing(null), await load())}
        />
      )}
    </>
  );
}

function ItemSheet({
  item,
  codes,
  defaultTaxCodeId,
  taxName,
  canSeeCosts,
  onClose,
  onSaved,
}: {
  item: Partial<PriceItemRow>;
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
      <SheetContent title={item.id ? "Price book item" : "New price book item"}>
        <form
          className="flex flex-col gap-3 px-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const body = {
              kind: form.kind,
              name: form.name,
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
