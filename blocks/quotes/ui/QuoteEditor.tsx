"use client";

// The quote screen. A draft is edited in place on the phone: tap a line to
// change it, add from the price book, totals update as you type, and it
// saves itself. Once sent it's read-only: revisions, PDF, accept/decline.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileText, Plus, Send, Star } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Field,
  FormActions,
  Label,
  PageHeader,
  SearchInput,
  Section,
  Segmented,
  SelectField,
  Sheet,
  SheetContent,
  Stack,
  Switch,
  api,
  cn,
  useAction,
} from "@grid/ui";
import { calculate, formatMoney, groupBySection } from "../money";
import { ClientPicker, type ClientJson } from "./ClientPicker";
import { StatusBadge } from "./StatusBadge";

export interface LineJson {
  key: string;
  section: string | null;
  priceItemId: string | null;
  description: string;
  qty: number;
  unit: string;
  cost: number | null;
  sell: number;
  taxCodeId: string | null;
  optional: boolean;
}

export interface QuoteJson {
  id: string;
  number: string;
  title: string;
  status: string;
  client: ClientJson | null;
  siteAddress: string | null;
  clientView: "ITEMISED" | "SECTIONS" | "LUMP";
  pricesIncludeTax: boolean;
  validUntil: string;
  intro: string | null;
  terms: string | null;
  internalNotes: string | null;
  projectId: string | null;
  acceptedAt: string | null;
  acceptedHow: string | null;
  acceptedNote: string | null;
  acceptedOptions: number[];
  /** With the extras the customer chose (when they chose any). */
  acceptedTotalCents: number | null;
  viewedAt: string | null;
  link: {
    id: string;
    status: "OPEN" | "SIGNED" | "DECLINED" | "REVOKED";
    url: string | null;
    recipientEmail: string;
    expiresAt: string;
    viewedAt: string | null;
    signedAt: string | null;
    signerName: string | null;
    verifyCode: string | null;
  } | null;
  declineReason: string | null;
  lines: Omit<LineJson, "key">[];
  revisions: { id: string; label: string; sentAt: string; sentTo: string | null; hasPdf: boolean; sentBy: string }[];
  events: { type: string; at: string; by: string | null; note: string | null }[];
  settings: { currency: string; locale: string; taxName: string; rounding: string; defaultTaxCodeId: string | null; codes: { id: string; name: string; label: string; rate: number; active: boolean }[] };
  canSeeCosts: boolean;
}

interface PriceItemJson {
  id: string;
  kind: "LABOUR" | "MATERIAL";
  name: string;
  unit: string;
  cost: number | null;
  sell: number;
  taxCodeId: string | null;
  favourite: boolean;
}

let lineCounter = 0;
const key = () => `l${++lineCounter}`;
const toNum = (text: string) => {
  const value = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(value) ? value : 0;
};
const dateInput = (isoDate: string) => isoDate.slice(0, 10);
const when = (isoDate: string) => new Date(isoDate).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function QuoteEditor({ initial, permissions, emailReady }: { initial: QuoteJson; permissions: { edit: boolean; send: boolean }; emailReady: boolean }) {
  const [quote, setQuote] = useState(initial);
  const [lines, setLines] = useState<LineJson[]>(() => initial.lines.map((line) => ({ ...line, key: key() })));
  const [form, setForm] = useState({
    title: initial.title,
    client: initial.client,
    siteAddress: initial.siteAddress ?? "",
    clientView: initial.clientView,
    pricesIncludeTax: initial.pricesIncludeTax,
    validUntil: dateInput(initial.validUntil),
    intro: initial.intro ?? "",
    terms: initial.terms ?? "",
    internalNotes: initial.internalNotes ?? "",
  });
  const [save, setSave] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LineJson | null>(null);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [answer, setAnswer] = useState<"accept" | "decline" | null>(null);
  const draft = quote.status === "DRAFT" && permissions.edit;
  const settings = quote.settings;
  const money = useCallback((cents: number) => formatMoney(cents, settings.currency, settings.locale), [settings.currency, settings.locale]);

  const totals = useMemo(
    () =>
      calculate(
        lines.map((line) => ({ qty: line.qty, unitCents: Math.round(line.sell * 100), unitCostCents: line.cost == null ? null : Math.round(line.cost * 100), taxCodeId: line.taxCodeId, optional: line.optional })),
        { pricesIncludeTax: form.pricesIncludeTax, rounding: settings.rounding as "LINE" | "TOTAL", codes: settings.codes },
      ),
    [lines, form.pricesIncludeTax, settings.rounding, settings.codes],
  );

  // --- autosave ---------------------------------------------------------
  const body = useMemo(
    () => ({
      title: form.title.trim() || quote.title,
      clientId: form.client?.id ?? null,
      siteAddress: form.siteAddress,
      clientView: form.clientView,
      pricesIncludeTax: form.pricesIncludeTax,
      validUntil: form.validUntil,
      intro: form.intro,
      terms: form.terms,
      internalNotes: form.internalNotes,
      lines: lines
        .filter((line) => line.description.trim())
        .map(({ key: _k, cost, ...line }) => ({ ...line, ...(quote.canSeeCosts ? { cost } : {}) })),
    }),
    [form, lines, quote.title, quote.canSeeCosts],
  );
  const json = JSON.stringify(body);
  const lastSaved = useRef(json);
  const saving = useRef<Promise<void> | null>(null);

  const flush = useCallback(async () => {
    if (saving.current) await saving.current;
    if (json === lastSaved.current) return;
    setSave("saving");
    const pending = api(`/quotes/${quote.id}`, { method: "PATCH", body })
      .then(() => {
        lastSaved.current = json;
        setSave("saved");
        setSaveError(null);
      })
      .catch((error: Error) => {
        setSave("error");
        setSaveError(error.message);
        throw error;
      })
      .finally(() => (saving.current = null));
    saving.current = pending;
    await pending;
  }, [json, body, quote.id]);

  useEffect(() => {
    if (!draft || json === lastSaved.current) return;
    setSave("pending");
    const timer = setTimeout(() => void flush().catch(() => {}), 800);
    return () => clearTimeout(timer);
  }, [json, draft, flush]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (json !== lastSaved.current && draft) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [json, draft]);

  const reload = async () => {
    const latest = await api<QuoteJson>(`/quotes/${quote.id}`);
    setQuote(latest);
    setLines(latest.lines.map((line) => ({ ...line, key: key() })));
    lastSaved.current = JSON.stringify({ ...body, lines: latest.lines });
  };

  // --- lines ------------------------------------------------------------
  const putLine = (line: LineJson) => setLines((currentLines) => (currentLines.some((existing) => existing.key === line.key) ? currentLines.map((existing) => (existing.key === line.key ? line : existing)) : [...currentLines, line]));
  const move = (key: string, direction: -1 | 1) =>
    setLines((currentLines) => {
      const position = currentLines.findIndex((existing) => existing.key === key);
      const target = position + direction;
      if (position < 0 || target < 0 || target >= currentLines.length) return currentLines;
      const copy = [...currentLines];
      [copy[position], copy[target]] = [copy[target]!, copy[position]!];
      return copy;
    });
  const lastSection = [...lines].reverse().find((line) => line.section)?.section ?? null;
  const blank = (): LineJson => ({
    key: key(),
    section: lastSection,
    priceItemId: null,
    description: "",
    qty: 1,
    unit: "each",
    cost: null,
    sell: 0,
    taxCodeId: settings.defaultTaxCodeId,
    optional: false,
  });

  const codeLabel = (id: string | null) => settings.codes.find((code) => code.id === id)?.label ?? "";
  const lineAmount = (index: number) => totals.lines[index]?.amountCents ?? 0;

  // --- render -------------------------------------------------------------
  const expired = quote.status === "SENT" && new Date(quote.validUntil) < new Date();
  const status = (
    <span className="flex flex-wrap items-center gap-2">
      <span>{quote.number}</span>
      <StatusBadge status={quote.status} viewed={!!quote.viewedAt} />
      {expired && <Badge variant="warning">Past valid date</Badge>}
      {draft && (
        <span className={cn("text-xs", save === "error" ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
          {save === "saved" ? "Saved" : save === "error" ? "Not saved" : "Saving…"}
        </span>
      )}
    </span>
  );

  return (
    <>
      <PageHeader
        title={form.title || "Quote"}
        meta={status}
        actions={
          <Button variant="outline" asChild>
            <a
              href={`/api/quotes/${quote.id}/pdf`}
              target="_blank"
              rel="noopener"
              onClick={async (event) => {
                if (!draft || json === lastSaved.current) return;
                event.preventDefault();
                await flush().catch(() => {});
                window.open(`/api/quotes/${quote.id}/pdf`, "_blank", "noopener");
              }}
            >
              <FileText />
              <span className="hidden sm:inline">{draft ? "Preview PDF" : "PDF"}</span>
            </a>
          </Button>
        }
      />
      <Stack>
        <Alert variant="error">{saveError && `Couldn't save: ${saveError}`}</Alert>

        {!draft && <Outcome quote={quote} permissions={permissions} onAnswer={setAnswer} reload={reload} />}

        {/* Lines */}
        <Section
          flush
          title="Prices"
          description={draft ? `Prices ${form.pricesIncludeTax ? "include" : "exclude"} ${settings.taxName}. Tap a line to change it.` : undefined}
        >
          <ul className="divide-y border-t">
            {groupBySection(lines).map((group) => (
              <li key={group.section ?? ""}>
                {group.section && <div className="bg-muted/50 px-4 pt-3 pb-1 text-xs font-bold tracking-wide text-muted-foreground uppercase sm:px-5">{group.section}</div>}
                <ul className="divide-y">
                  {group.items.map(({ line, index }) => (
                    <li key={line.key}>
                      <button
                        type="button"
                        disabled={!draft}
                        onClick={() => setEditing(line)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left enabled:hover:bg-muted enabled:active:bg-muted sm:px-5"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium whitespace-pre-line">{line.description || <em className="text-muted-foreground">No description</em>}</span>
                          <span className="block text-sm text-muted-foreground tabular-nums">
                            {line.qty} {line.unit} × {money(Math.round(line.sell * 100))}
                            {codeLabel(line.taxCodeId) && ` · ${codeLabel(line.taxCodeId)}`}
                            {line.optional && " · Optional extra"}
                          </span>
                        </span>
                        <span className={cn("shrink-0 font-semibold tabular-nums", line.optional && "text-muted-foreground")}>{money(lineAmount(index))}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {lines.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground sm:px-5">No lines yet. Add labour and materials below.</li>}
          </ul>
          {draft && (
            <div className="grid grid-cols-2 gap-2 border-t p-3 sm:flex sm:justify-end">
              <Button variant="outline" onClick={() => setPicking(true)}>
                <Star /> Price book
              </Button>
              <Button variant="outline" onClick={() => setEditing(blank())}>
                <Plus /> Custom line
              </Button>
            </div>
          )}
          <Totals totals={totals} money={money} includesTax={form.pricesIncludeTax} taxName={settings.taxName} canSeeCosts={quote.canSeeCosts} />
        </Section>

        {draft ? (
          <>
            <Section title="Details">
              <div className="flex flex-col gap-4">
                <Field label="What's the job?" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
                <ClientPicker value={form.client} onChange={(value) => setForm({ ...form, client: value, siteAddress: form.siteAddress || value?.address || "" })} />
                <Field label="Site address" value={form.siteAddress} onChange={(event) => setForm({ ...form, siteAddress: event.target.value })} />
                <Field label="Valid until" type="date" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} />
                <div className="flex flex-col gap-2">
                  <Label>What the customer sees</Label>
                  <Segmented
                    label="What the customer sees"
                    value={form.clientView}
                    onChange={(value) => setForm({ ...form, clientView: value })}
                    items={[
                      { value: "ITEMISED", label: "Every line" },
                      { value: "SECTIONS", label: "Section totals" },
                      { value: "LUMP", label: "Total only" },
                    ]}
                  />
                </div>
                <label className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block font-medium">Prices include {settings.taxName}</span>
                    <span className="block text-sm text-muted-foreground">How you type prices on this quote</span>
                  </span>
                  <Switch checked={form.pricesIncludeTax} onCheckedChange={(checked) => setForm({ ...form, pricesIncludeTax: checked })} />
                </label>
                <TextArea label="Note to the customer" hint="Shown above the prices" value={form.intro} onChange={(value) => setForm({ ...form, intro: value })} />
                <TextArea label="Terms" value={form.terms} onChange={(value) => setForm({ ...form, terms: value })} rows={5} />
                <TextArea label="Internal notes" hint="Only your business sees these. Never on the PDF." value={form.internalNotes} onChange={(value) => setForm({ ...form, internalNotes: value })} />
              </div>
            </Section>
            {permissions.send && (
              <div className="sticky bottom-24 z-10 md:bottom-4 flex flex-col gap-2 sm:static sm:flex-row sm:justify-end">
                <Button size="lg" className="shadow-lg sm:shadow-sm" disabled={!lines.some((line) => !line.optional && line.description.trim())} onClick={() => void flush().then(() => setSending(true)).catch(() => {})}>
                  <Send /> {quote.revisions.length ? `Send Rev ${String.fromCharCode(65 + quote.revisions.length)}` : "Send quote"}
                </Button>
              </div>
            )}
            {quote.revisions.length === 0 && <DeleteDraft id={quote.id} />}
          </>
        ) : (
          <SentDetails quote={quote} />
        )}
      </Stack>

      {editing && (
        <LineSheet
          line={editing}
          isNew={!lines.some((line) => line.key === editing.key)}
          codes={settings.codes}
          canSeeCosts={quote.canSeeCosts}
          taxName={settings.taxName}
          includesTax={form.pricesIncludeTax}
          onClose={() => setEditing(null)}
          onSave={(line) => (putLine(line), setEditing(null))}
          onDelete={() => (setLines((currentLines) => currentLines.filter((existing) => existing.key !== editing.key)), setEditing(null))}
          onMove={(direction) => move(editing.key, direction)}
        />
      )}
      <PriceBookPicker
        open={picking}
        onOpenChange={setPicking}
        includesTax={form.pricesIncludeTax}
        codes={settings.codes}
        money={money}
        onPick={(item) => {
          // Price book prices are ex tax; convert when this quote is typed incl.
          const rate = settings.codes.find((code) => code.id === item.taxCodeId)?.rate ?? 0;
          const sell = form.pricesIncludeTax ? Math.round(item.sell * (1 + rate) * 100) / 100 : item.sell;
          // Tapping the same item again adds one more rather than a second line.
          const same = lines.find((line) => line.priceItemId === item.id && !line.optional && line.sell === sell);
          if (same) return putLine({ ...same, qty: same.qty + 1 });
          putLine({ ...blank(), priceItemId: item.id, description: item.name, unit: item.unit, sell, cost: item.cost, taxCodeId: item.taxCodeId ?? settings.defaultTaxCodeId });
        }}
      />
      {sending && (
        <SendSheet
          quote={quote}
          clientEmail={form.client?.email ?? ""}
          emailReady={emailReady}
          total={money(totals.totalCents)}
          onClose={() => setSending(false)}
          onSent={async () => (setSending(false), await reload())}
        />
      )}
      {answer && <AnswerSheet quote={quote} kind={answer} onClose={() => setAnswer(null)} onDone={async () => (setAnswer(null), await reload())} />}
    </>
  );
}

function Totals({
  totals,
  money,
  includesTax,
  taxName,
  canSeeCosts,
}: {
  totals: ReturnType<typeof calculate>;
  money: (cents: number) => string;
  includesTax: boolean;
  taxName: string;
  canSeeCosts: boolean;
}) {
  return (
    <dl className="flex flex-col gap-1 border-t px-4 py-3 text-sm tabular-nums sm:px-5">
      {!includesTax && (
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd>{money(totals.subtotalExCents)}</dd>
        </div>
      )}
      {totals.taxByCode
        .filter((code) => code.rate > 0)
        .map((code) => (
          <div key={code.id} className="flex justify-between">
            <dt className="text-muted-foreground">
              {includesTax ? "Includes " : ""}
              {code.label} ({Math.round(code.rate * 1000) / 10}%)
            </dt>
            <dd>{money(code.taxCents)}</dd>
          </div>
        ))}
      <div className="flex justify-between pt-1 text-lg font-bold">
        <dt>Total incl. {taxName}</dt>
        <dd>{money(totals.totalCents)}</dd>
      </div>
      {totals.optionsIncCents > 0 && (
        <div className="flex justify-between text-muted-foreground">
          <dt>Optional extras (not in total)</dt>
          <dd>{money(totals.optionsIncCents)}</dd>
        </div>
      )}
      {canSeeCosts && totals.costCents > 0 && (
        <div className="flex justify-between text-muted-foreground">
          <dt>Cost · margin (only you see this)</dt>
          <dd>
            {money(totals.costCents)}
            {totals.margin != null && ` · ${Math.round(totals.margin * 1000) / 10}% margin`}
          </dd>
        </div>
      )}
    </dl>
  );
}

function TextArea({ label, hint, value, onChange, rows = 3 }: { label: string; hint?: string; value: string; onChange: (value: string) => void; rows?: number }) {
  const id = `ta-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-touch w-full rounded-md border border-input bg-card px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

function LineSheet({
  line,
  isNew,
  codes,
  canSeeCosts,
  taxName,
  includesTax,
  onClose,
  onSave,
  onDelete,
  onMove,
}: {
  line: LineJson;
  isNew: boolean;
  codes: QuoteJson["settings"]["codes"];
  canSeeCosts: boolean;
  taxName: string;
  includesTax: boolean;
  onClose: () => void;
  onSave: (line: LineJson) => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [draft, setDraft] = useState({
    description: line.description,
    qty: String(line.qty),
    unit: line.unit,
    sell: line.sell ? String(line.sell) : "",
    cost: line.cost == null ? "" : String(line.cost),
    taxCodeId: line.taxCodeId ?? "",
    section: line.section ?? "",
    optional: line.optional,
  });
  const amount = toNum(draft.qty) * toNum(draft.sell);
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent title={isNew ? "New line" : "Line"}>
        <form
          className="flex flex-col gap-3 px-2"
          onSubmit={(event) => {
            event.preventDefault();
            onSave({
              ...line,
              description: draft.description.trim(),
              qty: toNum(draft.qty),
              unit: draft.unit.trim() || "each",
              sell: Math.round(toNum(draft.sell) * 100) / 100,
              cost: canSeeCosts ? (draft.cost.trim() ? Math.round(toNum(draft.cost) * 100) / 100 : null) : line.cost,
              taxCodeId: draft.taxCodeId || null,
              section: draft.section.trim() || null,
              optional: draft.optional,
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="line-desc">Description</Label>
            <textarea
              id="line-desc"
              rows={2}
              required
              autoFocus={isNew}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qty" inputMode="decimal" value={draft.qty} onChange={(event) => setDraft({ ...draft, qty: event.target.value })} required />
            <Field label="Unit" placeholder="each, hr, m" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} />
            <Field label={`Price ${includesTax ? "incl." : "ex"} ${taxName}`} inputMode="decimal" placeholder="0.00" value={draft.sell} onChange={(event) => setDraft({ ...draft, sell: event.target.value })} required />
            {canSeeCosts && <Field label="Cost (each)" hint="Only you see this" inputMode="decimal" value={draft.cost} onChange={(event) => setDraft({ ...draft, cost: event.target.value })} />}
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">Line amount: {amount.toFixed(2)}</p>
          <SelectField label="Tax" value={draft.taxCodeId} onChange={(event) => setDraft({ ...draft, taxCodeId: event.target.value })} options={[{ value: "", label: "No tax" }, ...codes.filter((code) => code.active || code.id === line.taxCodeId).map((code) => ({ value: code.id, label: code.name }))]} />
          <Field label="Section" hint="Optional, e.g. Kitchen, Switchboard. Groups lines on the quote." value={draft.section} onChange={(event) => setDraft({ ...draft, section: event.target.value })} />
          <label className="flex items-center gap-3">
            <Checkbox checked={draft.optional} onCheckedChange={(checked) => setDraft({ ...draft, optional: checked === true })} />
            <span>Optional extra (not in the total)</span>
          </label>
          <FormActions>
            {!isNew && (
              <div className="flex gap-2">
                <Button type="button" variant="ghost" className="text-destructive" onClick={onDelete}>
                  Remove
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Move up" onClick={() => onMove(-1)}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Move down" onClick={() => onMove(1)}>
                  <ArrowDown />
                </Button>
              </div>
            )}
            <Button type="submit">{isNew ? "Add line" : "Done"}</Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function PriceBookPicker({
  open,
  onOpenChange,
  onPick,
  includesTax,
  codes,
  money,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (item: PriceItemJson) => void;
  includesTax: boolean;
  codes: QuoteJson["settings"]["codes"];
  money: (cents: number) => string;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"ALL" | "LABOUR" | "MATERIAL">("ALL");
  const [items, setItems] = useState<PriceItemJson[] | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (kind !== "ALL") params.set("kind", kind);
      api<PriceItemJson[]>(`/quotes/items?${params}`)
        .then(setItems)
        .catch(() => setItems([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [open, query, kind]);
  useEffect(() => {
    if (!open) setAdded([]);
  }, [open]);
  const shown = (item: PriceItemJson) => {
    const rate = codes.find((code) => code.id === item.taxCodeId)?.rate ?? 0;
    return money(Math.round((includesTax ? item.sell * (1 + rate) : item.sell) * 100));
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Add from price book" description="Tap to add. Change the quantity after.">
        <div className="flex flex-col gap-3 px-2">
          <SearchInput label="Search the price book" placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
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
          <ul className="divide-y rounded-lg border">
            {items?.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => (onPick(item), setAdded((currentAdded) => [...currentAdded, item.id]))}
                  className="flex min-h-touch-lg w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted active:bg-muted"
                >
                  {item.favourite && <Star aria-label="Favourite" className="size-4 shrink-0 fill-current text-warning" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {item.kind === "LABOUR" ? "Labour" : "Material"} · {shown(item)} / {item.unit}
                    </span>
                  </span>
                  {added.includes(item.id) ? <Badge variant="success">Added{added.filter((addedId) => addedId === item.id).length > 1 ? ` ×${added.filter((addedId) => addedId === item.id).length}` : ""}</Badge> : <Plus className="size-5 text-primary" />}
                </button>
              </li>
            ))}
            {items?.length === 0 && (
              <li className="px-3 py-4 text-sm text-muted-foreground">
                {query ? "Nothing matches." : "Your price book is empty."} <a className="font-semibold underline" href="/b/quotes/price-book">Set up your price book</a>
              </li>
            )}
          </ul>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SendSheet({
  quote,
  clientEmail,
  emailReady,
  total,
  onClose,
  onSent,
}: {
  quote: QuoteJson;
  clientEmail: string;
  emailReady: boolean;
  total: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [how, setHow] = useState<"email" | "manual">(emailReady ? "email" : "manual");
  const [to, setTo] = useState(clientEmail);
  const [message, setMessage] = useState("");
  const action = useAction();
  const nextRevision = String.fromCharCode(65 + quote.revisions.length);
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent title={`Send ${quote.number} Rev ${nextRevision}`} description={`${total} · The PDF is saved as sent and won't change.`}>
        <form
          className="flex flex-col gap-3 px-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await action.run(() => api(`/quotes/${quote.id}/send`, { body: how === "email" ? { how, to, message: message || undefined } : { how } }));
            if (result) onSent();
          }}
        >
          <Segmented
            label="How"
            value={how}
            onChange={setHow}
            items={[
              { value: "email", label: "Email it" },
              { value: "manual", label: "I'll send it" },
            ]}
          />
          {how === "email" ? (
            emailReady ? (
              <>
                <Field label="To" type="email" inputMode="email" value={to} onChange={(event) => setTo(event.target.value)} required />
                <TextArea label="Message" hint="Optional. The PDF is attached, the email has a link to accept and sign online, and replies come to you." value={message} onChange={setMessage} />
              </>
            ) : (
              <Alert>Email isn&apos;t set up on this server yet (Settings › Email). Choose &quot;I&apos;ll send it&quot; and send the PDF yourself.</Alert>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              Marks the quote as sent and saves the PDF. Download it and send it however you like. If the client has an email address, you&apos;ll get a link to send too, so they can sign online.
            </p>
          )}
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={action.busy || (how === "email" && !emailReady)}>
              {action.busy ? "Sending…" : how === "email" ? "Send" : "Mark as sent"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function CopyLink({ url }: { url: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        ref={input}
        readOnly
        value={url}
        aria-label="Customer link"
        onFocus={(event) => event.currentTarget.select()}
        className="h-touch min-w-0 flex-1 rounded-md border border-input bg-muted px-3 text-sm"
      />
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
            } catch {
              // Not https: select it and fall back to the old copy command.
              input.current?.select();
              document.execCommand("copy");
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button variant="ghost" asChild>
          <a href={url} target="_blank" rel="noopener">
            Open
          </a>
        </Button>
      </div>
    </div>
  );
}

function Outcome({ quote, permissions, onAnswer, reload }: { quote: QuoteJson; permissions: { edit: boolean; send: boolean }; onAnswer: (kind: "accept" | "decline") => void; reload: () => Promise<void> }) {
  const action = useAction();
  const latest = quote.revisions.at(-1);
  const link = quote.link;
  const signedOnline = quote.acceptedHow === "SIGNED_ONLINE";
  const post = (path: string) => action.run(async () => (await api(`/quotes/${quote.id}/${path}`, { body: {} }), await reload()));
  return (
    <Section>
      <div className="flex flex-col gap-3">
        {quote.status === "SENT" && (
          <>
            <p>
              Rev {latest?.label} sent {latest && when(latest.sentAt)}
              {latest?.sentTo ? ` to ${latest.sentTo}` : " (sent by you)"}.{" "}
              {quote.viewedAt ? <strong>The customer opened it {when(quote.viewedAt)}.</strong> : "Waiting for an answer."}
            </p>
            {link?.status === "OPEN" && link.url ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  The customer can accept and sign, or decline, on this link until {new Date(link.expiresAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}. Codes go to {link.recipientEmail}.
                  {!latest?.sentTo && " Text or email it with the PDF."}
                </p>
                <CopyLink url={link.url} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No online link for this version: online acceptance is off, email isn&apos;t set up, or the client has no email address. Record their answer below.</p>
            )}
          </>
        )}
        {quote.status === "ACCEPTED" && (
          <div className="flex flex-col gap-2">
            <p>
              {signedOnline ? (
                <>
                  <strong>{quote.acceptedNote}</strong> on {quote.acceptedAt && when(quote.acceptedAt)}.
                  {quote.acceptedOptions.length > 0 && ` Chose ${quote.acceptedOptions.length} extra${quote.acceptedOptions.length === 1 ? "" : "s"}`}
                  {quote.acceptedTotalCents != null && `, bringing the total to ${formatMoney(quote.acceptedTotalCents, quote.settings.currency, quote.settings.locale)} incl. ${quote.settings.taxName}`}
                  {quote.acceptedOptions.length > 0 && "."}
                </>
              ) : (
                <>Accepted {quote.acceptedAt && when(quote.acceptedAt)} (recorded by staff{quote.acceptedNote ? `: ${quote.acceptedNote}` : ""}).</>
              )}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {signedOnline && (
                <Button asChild>
                  <a href={`/api/quotes/${quote.id}/pdf?signed=1`} target="_blank" rel="noopener">
                    <FileText /> Signed PDF
                  </a>
                </Button>
              )}
              {quote.projectId && (
                <Button variant="outline" asChild>
                  <a href={`/b/projects/${quote.projectId}`}>Open the job</a>
                </Button>
              )}
            </div>
            {signedOnline && link?.verifyCode && <p className="text-sm text-muted-foreground">Verify code {link.verifyCode}</p>}
          </div>
        )}
        {quote.status === "DECLINED" && <p>Declined{quote.declineReason ? `: ${quote.declineReason}` : "."}</p>}
        {quote.status === "WITHDRAWN" && <p>Withdrawn. The customer&apos;s link no longer works.</p>}
        <Alert variant="error">{action.error}</Alert>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {quote.status === "SENT" && permissions.send && (
            <>
              <Button variant={link?.status === "OPEN" ? "outline" : "default"} onClick={() => onAnswer("accept")}>
                Record acceptance
              </Button>
              <Button variant="outline" onClick={() => onAnswer("decline")}>
                Record decline
              </Button>
            </>
          )}
          {["SENT", "DECLINED", "EXPIRED"].includes(quote.status) && permissions.edit && (
            <Button variant="outline" disabled={action.busy} onClick={() => void post("reopen")}>
              Edit (new revision)
            </Button>
          )}
          {quote.status === "SENT" && permissions.send && (
            <Button variant="ghost" disabled={action.busy} onClick={() => void post("withdraw")}>
              Withdraw
            </Button>
          )}
        </div>
      </div>
    </Section>
  );
}

function AnswerSheet({ quote, kind, onClose, onDone }: { quote: QuoteJson; kind: "accept" | "decline"; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [createJob, setCreateJob] = useState(!quote.projectId);
  const action = useAction();
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        title={kind === "accept" ? "Record acceptance" : "Record decline"}
        description={kind === "accept" ? "For a yes by phone, email or on paper. The customer's link stops working." : "The customer's link stops working."}
      >
        <form
          className="flex flex-col gap-3 px-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await action.run(() =>
              kind === "accept"
                ? api<{ projectId: string | null }>(`/quotes/${quote.id}/accept`, { body: { note: note || undefined, createJob } })
                : api(`/quotes/${quote.id}/decline`, { body: { reason: note || undefined } }),
            );
            if (result === undefined) return;
            const projectId = (result as { projectId?: string | null }).projectId;
            if (kind === "accept" && createJob && projectId && !quote.projectId) window.location.href = `/b/projects/${projectId}`;
            else onDone();
          }}
        >
          <TextArea label={kind === "accept" ? "How they accepted" : "Reason (optional)"} hint={kind === "accept" ? "e.g. Replied by email on Tuesday" : undefined} value={note} onChange={setNote} />
          {kind === "accept" && !quote.projectId && (
            <label className="flex items-center gap-3">
              <Checkbox checked={createJob} onCheckedChange={(checked) => setCreateJob(checked === true)} />
              <span>
                Make the job now
                {quote.siteAddress ? <span className="block text-sm text-muted-foreground">At {quote.siteAddress}</span> : <span className="block text-sm text-destructive">Add a site address first (Edit)</span>}
              </span>
            </label>
          )}
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant={kind === "decline" ? "destructive" : "default"} disabled={action.busy}>
              {kind === "accept" ? (createJob && !quote.projectId ? "Accept and make the job" : "Mark accepted") : "Mark declined"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}

const EVENT_LABEL: Record<string, string> = {
  CREATED: "Started",
  VIEWED: "Opened",
  NOTE: "Note",
  SENT: "Sent",
  REOPENED: "Reopened",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
  JOB_CREATED: "Job made",
};

function SentDetails({ quote }: { quote: QuoteJson }) {
  return (
    <>
      <Section flush title="Sent versions">
        <ul className="divide-y border-t">
          {[...quote.revisions].reverse().map((revision) => (
            <li key={revision.id} className="flex min-h-touch-lg items-center gap-3 px-4 py-2 sm:px-5">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Rev {revision.label}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {when(revision.sentAt)} · {revision.sentTo ? `Emailed to ${revision.sentTo}` : "Sent by you"} · {revision.sentBy}
                </span>
              </span>
              {revision.hasPdf && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/quotes/${quote.id}/pdf?rev=${revision.id}`} target="_blank" rel="noopener">
                    PDF
                  </a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Section>
      {quote.internalNotes && (
        <Section title="Internal notes">
          <p className="whitespace-pre-line">{quote.internalNotes}</p>
        </Section>
      )}
      <Section flush title="History">
        <ul className="divide-y border-t">
          {quote.events.map((event, index) => (
            <li key={index} className="px-4 py-2 text-sm sm:px-5">
              <span className="font-medium">{EVENT_LABEL[event.type] ?? event.type}</span>
              <span className="text-muted-foreground">
                {" "}
                · {when(event.at)}
                {event.by && ` · ${event.by}`}
              </span>
              {event.note && <span className="block text-muted-foreground">{event.note}</span>}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

function DeleteDraft({ id }: { id: string }) {
  const action = useAction();
  return (
    <div className="flex flex-col items-center gap-2">
      <Alert variant="error">{action.error}</Alert>
      <Button
        variant="ghost"
        className="text-destructive"
        disabled={action.busy}
        onClick={async () => {
          if (!window.confirm("Delete this draft? It was never sent.")) return;
          const result = await action.run(() => api(`/quotes/${id}`, { method: "DELETE" }));
          if (result) window.location.href = "/b/quotes";
        }}
      >
        Delete draft
      </Button>
    </div>
  );
}

