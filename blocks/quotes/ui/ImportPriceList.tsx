"use client";

// Import a supplier's price list (docs/quotations-block.md "Supplier price
// lists"): pick the supplier and their Excel or CSV file, check which
// column is which (remembered per supplier), see what would change, pick
// any new products to add, and save. Nothing is saved before the last step.

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, FileSpreadsheet, Search } from "lucide-react";
import { Alert, Badge, Button, Checkbox, Field, FormActions, PageHeader, SearchInput, Section, Segmented, SelectField, Stack, api, buttonVariants, cn, useAction } from "@grid/ui";
import {
  FIELD_NAMES,
  PRICE_LIST_FIELDS,
  codeKey,
  findHeadingRow,
  guessColumns,
  readPriceList,
  savedColumnsFor,
  sellWithMarkup,
  type ColumnMap,
  type PriceListField,
  type PriceListRow,
  type SellPrices,
} from "../price-list";
import type { PriceListPreview, PriceListResult, SupplierListJson } from "../price-list-service";
import { formatMoney } from "../money";

interface ReadFile {
  name: string;
  cells: unknown[][];
}

/** How many changes and new products to show before "Show all". */
const SHOWN = 50;
const NOT_IN_FILE = "none";

/** The first sheet of an Excel or CSV file, row by row. CSV cells stay as typed (codes keep leading zeros). */
async function readSheet(file: File): Promise<ReadFile> {
  const XLSX = await import("xlsx");
  const data = new Uint8Array(await file.arrayBuffer());
  const isText = /\.(csv|txt|tsv)$/i.test(file.name);
  const workbook = XLSX.read(data, { raw: isText, dense: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]!];
  if (!firstSheet) throw new Error("That file has no sheets in it.");
  const cells = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, raw: false, defval: "", blankrows: true });
  return { name: file.name, cells };
}

const cellText = (value: unknown) => (value == null ? "" : String(value)).replace(/\s+/g, " ").trim();
const plural = (count: number, one: string, many: string) => `${count.toLocaleString("en-AU")} ${count === 1 ? one : many}`;
const percent = (before: number | null, after: number) => (before && before > 0 ? ((after - before) / before) * 100 : null);

export function ImportPriceList({ suppliers, currency, locale, taxName }: { suppliers: SupplierListJson[]; currency: string; locale: string; taxName: string }) {
  const [supplier, setSupplier] = useState(suppliers[0]?.lastImportedAt ? suppliers[0].supplier : "");
  const [file, setFile] = useState<ReadFile | null>(null);
  const [headingRow, setHeadingRow] = useState(0);
  const [columns, setColumns] = useState<ColumnMap>({});
  const [preview, setPreview] = useState<PriceListPreview | null>(null);
  const [sellPrices, setSellPrices] = useState<SellPrices>("KEEP_MARKUP");
  const [markup, setMarkup] = useState("");
  const [showAllChanges, setShowAllChanges] = useState(false);
  const [newSearch, setNewSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<PriceListResult | null>(null);
  const action = useAction();

  const money = (dollars: number) => formatMoney(Math.round(dollars * 100), currency, locale);
  const known = suppliers.find((entry) => entry.supplier.toLowerCase() === supplier.trim().toLowerCase()) ?? null;

  const headings = useMemo(() => (file?.cells[headingRow] ?? []).map(cellText), [file, headingRow]);
  const read = useMemo(() => (file ? readPriceList(file.cells, headingRow, columns) : { rows: [], skipped: [] }), [file, headingRow, columns]);
  const ready = columns.code != null && columns.cost != null;

  /** A new file, or a different supplier: guess the columns again (theirs from last time first). */
  const setUp = (next: ReadFile, savedFor: SupplierListJson | null) => {
    const row = findHeadingRow(next.cells);
    setHeadingRow(row);
    setColumns(guessColumns((next.cells[row] ?? []).map(cellText), savedFor?.columns));
    if (savedFor) {
      setSellPrices(savedFor.sellPrices);
      setMarkup(savedFor.newItemMarkup == null ? "" : String(savedFor.newItemMarkup));
    }
    setPreview(null);
  };

  const pick = (chosen: File) =>
    action.run(async () => {
      setResult(null);
      const next = await readSheet(chosen).catch((failure: unknown) => {
        throw new Error(failure instanceof Error && failure.message.includes("sheets") ? failure.message : "Grid couldn't read that file. Use an Excel (.xlsx, .xls) or CSV file.");
      });
      if (!next.cells.length) throw new Error("That file is empty.");
      setFile(next);
      setUp(next, known);
    });

  const check = (mode: SellPrices = sellPrices) =>
    action.run(async () => {
      if (!supplier.trim()) throw new Error("Say which supplier the list is from first.");
      if (!read.rows.length) throw new Error("No products found. Check the heading row and which column has the supplier code and price.");
      const planned = await api<PriceListPreview>("/quotes/price-lists/preview", {
        body: { supplier: supplier.trim(), sellPrices: mode, rows: read.rows.map((row) => [row.code, row.cost]) },
      });
      setPreview(planned);
      setPicked(new Set());
      setShowAllChanges(false);
    });

  const matched = useMemo(() => new Set(preview?.matchedCodes ?? []), [preview]);
  /** Products on the list that aren't in the price book (first of each code). */
  const newProducts = useMemo(() => {
    if (!preview) return [];
    const seen = new Set<string>();
    const products: PriceListRow[] = [];
    for (const row of read.rows) {
      const key = codeKey(row.code);
      if (matched.has(key) || seen.has(key)) continue;
      seen.add(key);
      products.push(row);
    }
    return products;
  }, [preview, read.rows, matched]);
  const newMatches = useMemo(() => {
    const words = newSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return newProducts.filter((row) => words.every((word) => `${row.code} ${row.description} ${row.brand ?? ""}`.toLowerCase().includes(word))).slice(0, SHOWN);
  }, [newProducts, newSearch]);
  const pickedProducts = newProducts.filter((row) => picked.has(codeKey(row.code)));

  const changes = useMemo(
    () => [...(preview?.changes ?? [])].sort((first, second) => Math.abs(percent(second.costBefore, second.costAfter) ?? 0) - Math.abs(percent(first.costBefore, first.costAfter) ?? 0)),
    [preview],
  );
  const wentUp = changes.filter((change) => change.costBefore != null && change.costAfter > change.costBefore).length;
  const wentDown = changes.filter((change) => change.costBefore != null && change.costAfter < change.costBefore).length;
  const markupNumber = markup.trim() === "" ? null : Number(markup);
  const markupBad = markupNumber != null && (!Number.isFinite(markupNumber) || markupNumber < 0);

  const save = () =>
    action.run(async () => {
      if (!file || !preview) return;
      if (markupBad) throw new Error("The markup for new items needs to be a number, like 30.");
      const saved = await api<PriceListResult>("/quotes/price-lists/import", {
        body: {
          supplier: supplier.trim(),
          fileName: file.name,
          columns: savedColumnsFor(headings, columns),
          sellPrices,
          newItemMarkup: markupNumber,
          rows: read.rows.filter((row) => matched.has(codeKey(row.code))).map((row) => [row.code, row.cost]),
          add: pickedProducts.map((row) => ({ code: row.code, description: row.description, cost: row.cost, unit: row.unit, brand: row.brand })),
        },
      });
      setResult(saved);
      setPreview(null);
      setFile(null);
    });

  if (result) {
    const lines = [
      result.costsChanged && `${plural(result.costsChanged, "cost", "costs")} updated`,
      result.sellPricesChanged && `${plural(result.sellPricesChanged, "sell price", "sell prices")} moved with them`,
      result.added && `${plural(result.added, "item", "items")} added`,
      result.unchanged && `${plural(result.unchanged, "item was", "items were")} already right`,
    ].filter(Boolean);
    return (
      <>
        <PageHeader title="Import a price list" />
        <Section title="Done">
          <Stack>
            <p>{lines.length ? lines.join(" · ") : "Nothing needed changing."}</p>
            <p className="text-sm text-muted-foreground">Each change is in the item's price history. Quotes already sent keep the prices they went out with.</p>
            <FormActions>
              <a href="/quotes/price-book" className={buttonVariants()}>
                Back to the price book
              </a>
              <Button variant="outline" onClick={() => setResult(null)}>
                Import another list
              </Button>
            </FormActions>
          </Stack>
        </Section>
      </>
    );
  }

  const columnOptions = [{ value: NOT_IN_FILE, label: "Not in this file" }, ...headings.map((heading, index) => ({ value: String(index), label: heading || `Column ${index + 1}` })).filter((option) => option.label)];
  const firstProduct = file ? (file.cells[headingRow + 1] ?? []) : [];

  return (
    <>
      <PageHeader title="Import a price list" subtitle={`Update your buy prices from a supplier's Excel or CSV list (prices ex ${taxName}). You'll see every change before anything is saved.`} />
      <Stack>
        <Section title="Supplier and file">
          <Stack>
            <Field
              label="Supplier"
              hint={
                known?.lastImportedAt
                  ? `Last imported ${new Date(known.lastImportedAt).toLocaleDateString("en-AU")} · ${plural(known.itemCount, "item", "items")} in your price book`
                  : known
                    ? `${plural(known.itemCount, "item", "items")} in your price book`
                    : "As it's written in Supplier on your price book items, e.g. MMEM"
              }
              list="price-list-suppliers"
              value={supplier}
              onChange={(event) => {
                setSupplier(event.target.value);
                const next = suppliers.find((entry) => entry.supplier.toLowerCase() === event.target.value.trim().toLowerCase()) ?? null;
                if (file) setUp(file, next);
              }}
              autoComplete="off"
            />
            <datalist id="price-list-suppliers">
              {suppliers.map((entry) => (
                <option key={entry.supplier} value={entry.supplier} />
              ))}
            </datalist>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className={cn(buttonVariants(), "w-full cursor-pointer sm:w-auto", action.busy && "pointer-events-none opacity-50")}>
                <FileSpreadsheet /> {file ? "Pick another file" : "Pick the price list"}
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.ods,.txt,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="sr-only"
                  onChange={(event) => {
                    const chosen = event.target.files?.[0];
                    event.target.value = "";
                    if (chosen) void pick(chosen);
                  }}
                />
              </label>
              {file && <p className="min-w-0 truncate text-sm text-muted-foreground">{file.name}</p>}
            </div>
            {!file && action.error && <Alert variant="error">{action.error}</Alert>}
          </Stack>
        </Section>

        {file && (
          <Section title="Which column is which" description={known?.lastImportedAt ? "Picked from this supplier's last list. Check they're still right." : "Grid guessed from the headings. Check them against the first product."}>
            <Stack>
              <SelectField
                label="The headings are on row"
                value={String(headingRow)}
                onChange={(event) => {
                  const row = Number(event.target.value);
                  setHeadingRow(row);
                  setColumns(guessColumns((file.cells[row] ?? []).map(cellText), known?.columns));
                  setPreview(null);
                }}
                options={file.cells.slice(0, 30).map((row, index) => ({
                  value: String(index),
                  label: `Row ${index + 1}: ${(row ?? []).map(cellText).filter(Boolean).slice(0, 4).join(", ").slice(0, 60) || "(empty)"}`,
                }))}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                {PRICE_LIST_FIELDS.map((field: PriceListField) => (
                  <SelectField
                    key={field}
                    label={FIELD_NAMES[field] + (field === "code" || field === "cost" ? "" : " (if there is one)")}
                    hint={columns[field] != null && cellText(firstProduct[columns[field]!]) ? `First product: ${cellText(firstProduct[columns[field]!]).slice(0, 60)}` : field === "per" ? "For prices per 100 m, per pack…" : undefined}
                    value={columns[field] == null ? NOT_IN_FILE : String(columns[field])}
                    onChange={(event) => {
                      const value = event.target.value;
                      setColumns((current) => {
                        const next = { ...current };
                        // A column holds one thing: take it off any other field.
                        for (const other of PRICE_LIST_FIELDS) if (value !== NOT_IN_FILE && next[other] === Number(value)) delete next[other];
                        if (value === NOT_IN_FILE) delete next[field];
                        else next[field] = Number(value);
                        return next;
                      });
                      setPreview(null);
                    }}
                    options={field === "code" || field === "cost" ? columnOptions.slice(1) : columnOptions}
                    placeholder="Pick the column"
                  />
                ))}
              </div>
              {ready && (
                <p className="text-sm text-muted-foreground">
                  {plural(read.rows.length, "product", "products")} found
                  {read.skipped.length > 0 && `, ${plural(read.skipped.length, "row", "rows")} skipped (${[...new Set(read.skipped.map((row) => row.reason.replace(/ \(.*\)$/, "")))].join(", ").toLowerCase()})`}
                  {read.rows[0] && ` · first: ${read.rows[0].code}, ${money(read.rows[0].cost)}${read.rows[0].unit ? ` / ${read.rows[0].unit}` : ""}`}
                </p>
              )}
              {!preview && action.error && <Alert variant="error">{action.error}</Alert>}
              {!preview && (
                <FormActions>
                  <Button onClick={() => void check()} disabled={!ready || action.busy || !supplier.trim()}>
                    <Search /> {action.busy ? "Checking…" : "Check what changes"}
                  </Button>
                </FormActions>
              )}
            </Stack>
          </Section>
        )}

        {preview && (
          <>
            <Section title="What changes">
              <Stack>
                <div className="flex flex-wrap gap-2">
                  {wentUp > 0 && <Badge variant="warning">{plural(wentUp, "cost", "costs")} up</Badge>}
                  {wentDown > 0 && <Badge variant="success">{plural(wentDown, "cost", "costs")} down</Badge>}
                  {changes.length - wentUp - wentDown > 0 && <Badge>{plural(changes.length - wentUp - wentDown, "item gets", "items get")} a cost</Badge>}
                  <Badge>{plural(preview.unchanged, "already right", "already right")}</Badge>
                  {preview.notOnList.length > 0 && <Badge>{plural(preview.notOnList.length, "of yours isn't", "of yours aren't")} on this list</Badge>}
                  <Badge>{plural(newProducts.length, "product", "products")} you don't have</Badge>
                </div>
                <Segmented
                  label="Sell prices"
                  value={sellPrices}
                  onChange={(mode) => {
                    setSellPrices(mode);
                    void check(mode);
                  }}
                  items={[
                    { value: "KEEP_MARKUP", label: "Keep my markup" },
                    { value: "KEEP_SELL", label: "Leave sell prices" },
                  ]}
                />
                <p className="text-sm text-muted-foreground">
                  {sellPrices === "KEEP_MARKUP"
                    ? "Each sell price moves with its cost, by the same amount in percent. Items with no cost yet keep their sell price."
                    : "Only costs change. Your margins shrink or grow with them."}{" "}
                  Quotes already sent keep their prices.
                </p>
                {preview.duplicateCodes.length > 0 && (
                  <Alert variant="info">
                    {plural(preview.duplicateCodes.length, "code is", "codes are")} on the list twice with different prices ({preview.duplicateCodes.slice(0, 5).join(", ")}
                    {preview.duplicateCodes.length > 5 ? "…" : ""}). The first one is used.
                  </Alert>
                )}
              </Stack>
            </Section>

            {changes.length > 0 && (
              <Section title={`Price changes (${changes.length.toLocaleString("en-AU")})`} description="Biggest changes first." flush>
                <ul className="divide-y">
                  {(showAllChanges ? changes : changes.slice(0, SHOWN)).map((change) => {
                    const moved = percent(change.costBefore, change.costAfter);
                    return (
                      <li key={change.itemId} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{change.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {change.code}
                            {change.setsSupplier && ` · gets supplier ${supplier.trim()}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-sm tabular-nums sm:justify-end">
                          <span>
                            Cost {change.costBefore == null ? "none" : money(change.costBefore)} → <span className="font-semibold">{money(change.costAfter)}</span>
                          </span>
                          {moved != null && Math.abs(moved) >= 0.05 && (
                            <span className={cn("inline-flex items-center gap-0.5 font-semibold", moved > 0 ? "text-warning" : "text-success")}>
                              {moved > 0 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
                              {Math.abs(moved).toFixed(1)}%
                            </span>
                          )}
                          {change.sellAfter !== change.sellBefore && (
                            <span className="text-muted-foreground">
                              Sell {money(change.sellBefore)} → {money(change.sellAfter)}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {!showAllChanges && changes.length > SHOWN && (
                  <div className="px-4 pb-4 sm:px-5">
                    <Button variant="ghost" onClick={() => setShowAllChanges(true)}>
                      Show all {changes.length.toLocaleString("en-AU")}
                    </Button>
                  </div>
                )}
              </Section>
            )}

            {preview.notOnList.length > 0 && (
              <Section title={`Not on this list (${preview.notOnList.length.toLocaleString("en-AU")})`} description="Your items from this supplier that the list doesn't have. They might be discontinued or have a new code. Nothing happens to them." flush>
                <ul className="divide-y">
                  {preview.notOnList.slice(0, SHOWN).map((item) => (
                    <li key={item.id} className="px-4 py-2.5 sm:px-5">
                      <p className="truncate">{item.name}</p>
                      <p className="text-sm text-muted-foreground">{item.code}</p>
                    </li>
                  ))}
                </ul>
                {preview.notOnList.length > SHOWN && <p className="px-4 pb-4 text-sm text-muted-foreground sm:px-5">and {(preview.notOnList.length - SHOWN).toLocaleString("en-AU")} more</p>}
              </Section>
            )}

            {newProducts.length > 0 && (
              <Section title="Add from this list" description={`${plural(newProducts.length, "product", "products")} on the list aren't in your price book. Search for any you want to add.`}>
                <Stack>
                  <SearchInput label="Search the list" placeholder="Code, description or brand" value={newSearch} onChange={(event) => setNewSearch(event.target.value)} />
                  {newMatches.length > 0 && (
                    <ul className="-mx-4 divide-y sm:-mx-5">
                      {newMatches.map((row) => {
                        const key = codeKey(row.code);
                        const checked = picked.has(key);
                        return (
                          <li key={key}>
                            <label className="flex min-h-touch cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-muted sm:px-5">
                              <Checkbox
                                className="mt-0.5"
                                checked={checked}
                                onCheckedChange={(value) =>
                                  setPicked((current) => {
                                    const next = new Set(current);
                                    if (value === true) next.add(key);
                                    else next.delete(key);
                                    return next;
                                  })
                                }
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block">{row.description}</span>
                                <span className="block text-sm text-muted-foreground">
                                  {row.code}
                                  {row.brand && ` · ${row.brand}`} · {money(row.cost)}
                                  {row.unit ? ` / ${row.unit}` : ""}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {newSearch.trim() && !newMatches.length && <p className="text-sm text-muted-foreground">Nothing on the list matches.</p>}
                  {pickedProducts.length > 0 && (
                    <>
                      <p className="text-sm">
                        <span className="font-semibold">{plural(pickedProducts.length, "item", "items")} to add:</span> {pickedProducts.map((row) => row.description).join(" · ")}
                      </p>
                      <Field
                        label="Markup on new items (%)"
                        inputMode="decimal"
                        value={markup}
                        onChange={(event) => setMarkup(event.target.value)}
                        error={markupBad ? "A number, like 30" : undefined}
                        hint={
                          markupNumber != null && !markupBad && pickedProducts[0]
                            ? `e.g. ${pickedProducts[0].description.slice(0, 40)}: cost ${money(pickedProducts[0].cost)}, sell ${money(sellWithMarkup(pickedProducts[0].cost, markupNumber))}`
                            : "Leave empty to sell at cost (a quote's materials markup can add your margin)"
                        }
                      />
                    </>
                  )}
                </Stack>
              </Section>
            )}

            <Section>
              <Stack>
                {action.error && <Alert variant="error">{action.error}</Alert>}
                <FormActions>
                  <Button onClick={() => void save()} disabled={action.busy || (!changes.length && !pickedProducts.length)}>
                    {action.busy
                      ? "Saving…"
                      : [changes.length && `Update ${plural(changes.length, "item", "items")}`, pickedProducts.length && `add ${plural(pickedProducts.length, "item", "items")}`].filter(Boolean).join(" and ").replace(/^a/, "A") ||
                        "Nothing to save"}
                  </Button>
                  <a href="/quotes/price-book" className={buttonVariants({ variant: "ghost" })}>
                    Cancel
                  </a>
                </FormActions>
              </Stack>
            </Section>
          </>
        )}
      </Stack>
    </>
  );
}
