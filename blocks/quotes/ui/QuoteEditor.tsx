"use client";

// The quote screen. A draft is edited in place on the phone: tap a line to
// change it, add from the price book, totals update as you type, and it
// saves itself. Once sent it's read-only: revisions, PDF, accept/decline.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, FileText, FolderInput, ListPlus, Plus, Send, Star, ToggleLeft, Trash2, type LucideIcon } from "lucide-react";
import { AddressField, Alert,
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
import { calculate, formatMoney, groupBySection, markedUpUnitCents } from "../money";
import { ClientPicker, type ClientJson } from "@grid/block-clients/components";
import { StatusBadge } from "./StatusBadge";
import { isSwipeAction, type SwipeAction } from "../swipe";

export interface LineJson {
  key: string;
  section: string | null;
  priceItemId: string | null;
  /** Labour, material, or null for other. Material lines get the materials markup. */
  kind: "LABOUR" | "MATERIAL" | null;
  description: string;
  qty: number;
  unit: string;
  cost: number | null;
  sell: number;
  /** From the server: the price the materials markup set, for people who can't see costs. */
  markupSell?: number | null;
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
  /** With the extras the client chose (when they chose any). */
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
  /** Materials markup on this quote; the % only for people who can see costs. */
  materialsMarkup: boolean;
  materialsMarkupPct: number | null;
  /** As saved: each line also has its database id (never sent back). */
  lines: (Omit<LineJson, "key"> & { id?: string })[];
  revisions: { id: string; label: string; sentAt: string; sentTo: string | null; hasPdf: boolean; sentBy: string }[];
  events: { type: string; at: string; by: string | null; note: string | null }[];
  settings: {
    currency: string;
    locale: string;
    taxName: string;
    rounding: string;
    defaultTaxCodeId: string | null;
    codes: { id: string; name: string; label: string; rate: number; active: boolean }[];
    /** What swiping a line left or right does (Settings › Tax & currency). */
    swipeLeft: string;
    swipeRight: string;
  };
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
  brand: string | null;
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
  // Saved lines come with their database id; the editor keys them itself and never sends the id back.
  const [lines, setLines] = useState<LineJson[]>(() => initial.lines.map(({ id: _id, ...line }) => ({ ...line, key: key() })));
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
    materialsMarkup: initial.materialsMarkup,
    materialsMarkupPct: initial.materialsMarkupPct == null ? "" : String(initial.materialsMarkupPct),
  });
  const [save, setSave] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LineJson | null>(null);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  /** The line just deleted, for Undo. */
  const [undo, setUndo] = useState<{ line: LineJson; index: number } | null>(null);
  const [sectionFor, setSectionFor] = useState<LineJson | null>(null);
  const [sending, setSending] = useState(false);
  const [answer, setAnswer] = useState<"accept" | "decline" | null>(null);
  const draft = quote.status === "DRAFT" && permissions.edit;
  const settings = quote.settings;
  const money = useCallback((cents: number) => formatMoney(cents, settings.currency, settings.locale), [settings.currency, settings.locale]);

  // The materials markup % in use: null when it's off (or blank).
  const markupPct = form.materialsMarkup && form.materialsMarkupPct.trim() !== "" ? toNum(form.materialsMarkupPct) : null;
  const totals = useMemo(
    () =>
      calculate(
        lines.map((line) =>
          quote.canSeeCosts
            ? { qty: line.qty, unitCents: Math.round(line.sell * 100), unitCostCents: line.cost == null ? null : Math.round(line.cost * 100), taxCodeId: line.taxCodeId, optional: line.optional, material: line.kind === "MATERIAL" }
            : // Without costs the markup can't be worked out here: use the price the server set.
              { qty: line.qty, unitCents: Math.round((line.markupSell ?? line.sell) * 100), unitCostCents: null, taxCodeId: line.taxCodeId, optional: line.optional },
        ),
        { pricesIncludeTax: form.pricesIncludeTax, rounding: settings.rounding as "LINE" | "TOTAL", codes: settings.codes, materialsMarkupPct: markupPct },
      ),
    [lines, form.pricesIncludeTax, settings.rounding, settings.codes, markupPct, quote.canSeeCosts],
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
      ...(quote.canSeeCosts ? { materialsMarkup: form.materialsMarkup, materialsMarkupPct: form.materialsMarkupPct.trim() === "" ? null : toNum(form.materialsMarkupPct) } : {}),
      lines: lines
        .filter((line) => line.description.trim())
        // Only the fields a line has (the server refuses anything else).
        .map((line) => ({
          section: line.section,
          priceItemId: line.priceItemId,
          kind: line.kind,
          description: line.description,
          qty: line.qty,
          unit: line.unit,
          sell: line.sell,
          taxCodeId: line.taxCodeId,
          optional: line.optional,
          ...(quote.canSeeCosts ? { cost: line.cost } : {}),
        })),
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
    const pending = api<QuoteJson>(`/quotes/${quote.id}`, { method: "PATCH", body })
      .then((saved) => {
        // Without costs, the server works out the materials markup prices: show them.
        // Saved lines are the ones with a description, in order.
        if (!quote.canSeeCosts) {
          let position = 0;
          setLines((currentLines) => currentLines.map((line) => (line.description.trim() ? { ...line, markupSell: saved.lines[position++]?.markupSell ?? null } : line)));
        }
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
  }, [json, body, quote.id, quote.canSeeCosts]);

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
    setLines(latest.lines.map(({ id: _id, ...line }) => ({ ...line, key: key() })));
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
  const removeLine = (line: LineJson) => {
    const index = lines.findIndex((existing) => existing.key === line.key);
    if (index < 0) return;
    setLines((currentLines) => currentLines.filter((existing) => existing.key !== line.key));
    setUndo({ line, index });
  };
  const duplicateLine = (line: LineJson) =>
    setLines((currentLines) => {
      const index = currentLines.findIndex((existing) => existing.key === line.key);
      const copy = [...currentLines];
      copy.splice(index + 1, 0, { ...line, key: key() });
      return copy;
    });
  const swipeLeft = isSwipeAction(settings.swipeLeft) ? settings.swipeLeft : "OFF";
  const swipeRight = isSwipeAction(settings.swipeRight) ? settings.swipeRight : "OFF";
  const runSwipe = (action: SwipeAction, line: LineJson) => {
    if (action === "DELETE") removeLine(line);
    else if (action === "DUPLICATE") duplicateLine(line);
    else if (action === "OPTIONAL") putLine({ ...line, optional: !line.optional });
    else if (action === "QTY_UP") putLine({ ...line, qty: Math.round((line.qty + 1) * 1000) / 1000 });
    else if (action === "SECTION") setSectionFor(line);
  };
  const sections = [...new Set(lines.map((line) => line.section?.trim()).filter((section): section is string => !!section))];
  const lastSection = [...lines].reverse().find((line) => line.section)?.section ?? null;
  const blank = (): LineJson => ({
    key: key(),
    section: lastSection,
    priceItemId: null,
    kind: null,
    description: "",
    qty: 1,
    unit: "each",
    cost: null,
    sell: 0,
    markupSell: null,
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
              href={`/quotes/${quote.id}/pdf`}
              onClick={async (event) => {
                if (!draft) return;
                // The preview is drawn from what's saved, so save what's on screen
                // first; a failed save shows why and stays here.
                event.preventDefault();
                try {
                  if (saving.current || json !== lastSaved.current) await flush();
                  window.location.href = `/quotes/${quote.id}/pdf`;
                } catch {
                  // The error is shown at the top of the quote.
                }
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
          actions={
            draft && (
              <Button variant="outline" size="icon" aria-label="Add a line" onClick={() => setAdding(true)}>
                <Plus />
              </Button>
            )
          }
        >
          <ul className="divide-y border-t">
            {groupBySection(lines).map((group) => (
              <li key={group.section ?? ""}>
                {group.section && <div className="bg-muted/50 px-4 pt-3 pb-1 text-xs font-bold tracking-wide text-muted-foreground uppercase sm:px-5">{group.section}</div>}
                <ul className="divide-y">
                  {group.items.map(({ line, index }) => (
                    <SwipeRow key={line.key} left={draft ? swipeLeft : "OFF"} right={draft ? swipeRight : "OFF"} line={line} onSwipe={(action) => runSwipe(action, line)}>
                      <button
                        type="button"
                        disabled={!draft}
                        onClick={() => setEditing(line)}
                        className="flex w-full items-start gap-3 bg-card px-4 py-3 text-left enabled:hover:bg-muted enabled:active:bg-muted sm:px-5"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium whitespace-pre-line">{line.description || <em className="text-muted-foreground">No description</em>}</span>
                          <span className="block text-sm text-muted-foreground tabular-nums">
                            {line.qty} {line.unit} × {money(totals.lines[index]?.unitCents ?? Math.round(line.sell * 100))}
                            {codeLabel(line.taxCodeId) && ` · ${codeLabel(line.taxCodeId)}`}
                            {line.kind === "MATERIAL" && " · Material"}
                            {line.kind === "LABOUR" && " · Labour"}
                            {line.optional && " · Optional extra"}
                          </span>
                          {quote.canSeeCosts && markupPct != null && line.kind === "MATERIAL" && line.cost == null && (
                            <span className="block text-sm text-warning">No cost, so not marked up</span>
                          )}
                        </span>
                        <span className={cn("shrink-0 font-semibold tabular-nums", line.optional && "text-muted-foreground")}>{money(lineAmount(index))}</span>
                      </button>
                    </SwipeRow>
                  ))}
                </ul>
              </li>
            ))}
            {lines.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground sm:px-5">{draft ? "No lines yet. Tap + to add labour and materials." : "No lines."}</li>
            )}
          </ul>
          {draft && quote.canSeeCosts && (
            <div className="flex flex-col gap-3 border-t px-4 py-3 sm:px-5">
              <label className="flex items-center justify-between gap-3">
                <span>
                  <span className="block font-medium">Materials markup</span>
                  <span className="block text-sm text-muted-foreground">Prices every material at its cost plus this %, instead of its own price. Only you see it.</span>
                </span>
                <Switch checked={form.materialsMarkup} onCheckedChange={(checked) => setForm({ ...form, materialsMarkup: checked })} />
              </label>
              {form.materialsMarkup && (
                <div className="max-w-48">
                  <Field
                    label="Markup %"
                    inputMode="decimal"
                    placeholder="e.g. 30"
                    value={form.materialsMarkupPct}
                    onChange={(event) => setForm({ ...form, materialsMarkupPct: event.target.value })}
                    hint={markupPct == null ? "Enter a % to mark up" : `${totals.lines.filter((line) => line.markedUp).length} material lines marked up`}
                  />
                </div>
              )}
            </div>
          )}
          <Totals totals={totals} money={money} includesTax={form.pricesIncludeTax} taxName={settings.taxName} canSeeCosts={quote.canSeeCosts} markupPct={markupPct} />
        </Section>

        {draft ? (
          <>
            <Section title="Details">
              <div className="flex flex-col gap-4">
                <Field label="What's the job?" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
                <ClientPicker value={form.client} onChange={(value) => setForm({ ...form, client: value, siteAddress: form.siteAddress || value?.address || "" })} />
                <AddressField label="Site address" value={form.siteAddress} onChange={(event) => setForm({ ...form, siteAddress: event.target.value })} />
                <Field label="Valid until" type="date" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} />
                <div className="flex flex-col gap-2">
                  <Label>What the client sees</Label>
                  <Segmented
                    label="What the client sees"
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
                <TextArea label="Note to the client" hint="Shown above the prices" value={form.intro} onChange={(value) => setForm({ ...form, intro: value })} />
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
          markupPct={markupPct}
          markupOn={quote.canSeeCosts ? markupPct != null : quote.materialsMarkup}
          onClose={() => setEditing(null)}
          onSave={(line) => (putLine(line), setEditing(null))}
          onDelete={() => (removeLine(editing), setEditing(null))}
          onDuplicate={() => (duplicateLine(editing), setEditing(null))}
          onMove={(direction) => move(editing.key, direction)}
        />
      )}
      {undo && (
        <UndoBar
          key={undo.line.key}
          text={`Removed “${undo.line.description.trim().slice(0, 40) || "line"}”`}
          onUndo={() => {
            const { line, index } = undo;
            setLines((currentLines) => {
              const copy = [...currentLines];
              copy.splice(Math.min(index, copy.length), 0, line);
              return copy;
            });
            setUndo(null);
          }}
          onDone={() => setUndo(null)}
        />
      )}
      {sectionFor && (
        <SectionSheet
          line={sectionFor}
          sections={sections}
          onClose={() => setSectionFor(null)}
          onPick={(section) => {
            putLine({ ...sectionFor, section });
            setSectionFor(null);
          }}
        />
      )}
      <AddLineSheet
        open={adding}
        onOpenChange={setAdding}
        onPriceBook={() => (setAdding(false), setPicking(true))}
        onCustom={() => (setAdding(false), setEditing(blank()))}
      />
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
          putLine({ ...blank(), priceItemId: item.id, kind: item.kind, description: item.name, unit: item.unit, sell, cost: item.cost, taxCodeId: item.taxCodeId ?? settings.defaultTaxCodeId });
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
  markupPct,
}: {
  totals: ReturnType<typeof calculate>;
  money: (cents: number) => string;
  includesTax: boolean;
  taxName: string;
  canSeeCosts: boolean;
  markupPct: number | null;
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
      {canSeeCosts && markupPct != null && (
        <div className="flex justify-between text-muted-foreground">
          <dt>Materials markup (only you see this)</dt>
          <dd>{markupPct}%</dd>
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
  markupPct,
  markupOn,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
  onMove,
}: {
  line: LineJson;
  isNew: boolean;
  codes: QuoteJson["settings"]["codes"];
  canSeeCosts: boolean;
  taxName: string;
  includesTax: boolean;
  /** The quote's materials markup %, when it's on and the % is known here (people who see costs). */
  markupPct: number | null;
  /** The materials markup is on (for people who can't see the %). */
  markupOn: boolean;
  onClose: () => void;
  onSave: (line: LineJson) => void;
  onDelete: () => void;
  onDuplicate: () => void;
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
    kind: (line.kind ?? "OTHER") as "LABOUR" | "MATERIAL" | "OTHER",
  });
  const taxRate = codes.find((code) => code.id === draft.taxCodeId)?.rate ?? 0;
  // The price the materials markup sets on this line, when it does. Without
  // costs, it's the server's price (for a line it already priced).
  const hasCost = canSeeCosts ? draft.cost.trim() !== "" : line.markupSell != null;
  const markedUp =
    draft.kind === "MATERIAL" && markupOn && hasCost
      ? canSeeCosts && markupPct != null
        ? (markedUpUnitCents({ material: true, unitCostCents: Math.round(toNum(draft.cost) * 100) }, markupPct, taxRate, includesTax) ?? 0) / 100
        : (line.markupSell ?? null)
      : null;
  const amount = toNum(draft.qty) * (markedUp ?? toNum(draft.sell));
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title={isNew ? "New line" : "Line"}>
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
              kind: draft.kind === "OTHER" ? null : draft.kind,
              markupSell: draft.kind === "MATERIAL" ? line.markupSell : null,
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
          <div className="flex flex-col gap-2">
            <Label>Type</Label>
            <Segmented
              label="Type"
              value={draft.kind}
              onChange={(value) => setDraft({ ...draft, kind: value })}
              items={[
                { value: "LABOUR", label: "Labour" },
                { value: "MATERIAL", label: "Material" },
                { value: "OTHER", label: "Other" },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qty" inputMode="decimal" value={draft.qty} onChange={(event) => setDraft({ ...draft, qty: event.target.value })} required />
            <Field label="Unit" placeholder="each, hr, m" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} />
            {markedUp != null ? (
              <Field
                label={`Price ${includesTax ? "incl." : "ex"} ${taxName}`}
                value={markedUp.toFixed(2)}
                readOnly
                disabled
                hint={canSeeCosts && markupPct != null ? `Cost + ${markupPct}% materials markup` : "Set by the materials markup"}
              />
            ) : (
              <Field label={`Price ${includesTax ? "incl." : "ex"} ${taxName}`} inputMode="decimal" placeholder="0.00" value={draft.sell} onChange={(event) => setDraft({ ...draft, sell: event.target.value })} required />
            )}
            {canSeeCosts && <Field label="Cost (each)" hint="Only you see this" inputMode="decimal" value={draft.cost} onChange={(event) => setDraft({ ...draft, cost: event.target.value })} />}
          </div>
          {canSeeCosts && markupPct != null && draft.kind === "MATERIAL" && !hasCost && <p className="text-sm text-warning">Add a cost to mark this material up. Until then it uses the price above.</p>}
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
                <Button type="button" variant="ghost" size="icon" aria-label="Duplicate" title="Duplicate" onClick={onDuplicate}>
                  <Copy />
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

const SWIPE_LOOK: Record<Exclude<SwipeAction, "OFF">, { icon: LucideIcon; label: (line: LineJson) => string; destructive?: boolean }> = {
  DELETE: { icon: Trash2, label: () => "Delete", destructive: true },
  DUPLICATE: { icon: Copy, label: () => "Duplicate" },
  OPTIONAL: { icon: ToggleLeft, label: (line) => (line.optional ? "Include in total" : "Make optional") },
  SECTION: { icon: FolderInput, label: () => "Move to section" },
  QTY_UP: { icon: ListPlus, label: () => "+1" },
};

/**
 * A line that can be swiped: drag it left or right and let go past the
 * mark (a third of the width, at most 160 px) to do that direction's
 * action. Up and down still scroll; a tap still opens the line.
 */
function SwipeRow({ left, right, line, onSwipe, children }: { left: SwipeAction; right: SwipeAction; line: LineJson; onSwipe: (action: SwipeAction) => void; children: React.ReactNode }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const row = useRef<HTMLLIElement>(null);
  const gesture = useRef<{ x: number; y: number; id: number; active: boolean; armed: boolean } | null>(null);
  const swallowClick = useRef(false);
  const mark = () => Math.min(160, (row.current?.offsetWidth ?? 300) / 3);
  // Swiping left (offset < 0) shows the left action on the right-hand side.
  const action: SwipeAction = offset < 0 ? left : offset > 0 ? right : "OFF";
  const look = action === "OFF" ? null : SWIPE_LOOK[action];
  const armed = offset !== 0 && Math.abs(offset) >= mark();

  if (left === "OFF" && right === "OFF") return <li>{children}</li>;
  return (
    <li
      ref={row}
      className="relative overflow-hidden"
      style={{ touchAction: "pan-y" }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId, active: false, armed: false };
      }}
      onPointerMove={(event) => {
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        if (!current.active) {
          // Mostly up or down: it's a scroll, not a swipe.
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
            gesture.current = null;
            return;
          }
          if (Math.abs(dx) < 10) return;
          current.active = true;
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        const allowed = (dx < 0 && left !== "OFF") || (dx > 0 && right !== "OFF");
        const next = allowed ? dx : 0;
        // A little buzz when passing the mark, on phones that can.
        const nowArmed = next !== 0 && Math.abs(next) >= mark();
        if (nowArmed !== current.armed) {
          current.armed = nowArmed;
          if (nowArmed) navigator.vibrate?.(10);
        }
        setOffset(next);
      }}
      onPointerUp={(event) => {
        const current = gesture.current;
        gesture.current = null;
        if (!current?.active) return;
        swallowClick.current = true;
        setDragging(false);
        setOffset(0);
        if (current.armed && action !== "OFF") onSwipe(action);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        gesture.current = null;
        setDragging(false);
        setOffset(0);
      }}
      onClickCapture={(event) => {
        // The click that ends a swipe isn't a tap.
        if (!swallowClick.current) return;
        swallowClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {look && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center gap-2 px-5 text-sm font-semibold",
            offset < 0 ? "justify-end" : "justify-start",
            look.destructive ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground",
            !armed && "opacity-70",
          )}
        >
          <look.icon className={cn("size-5 transition-transform", armed && "scale-125")} />
          {look.label(line)}
        </div>
      )}
      <div className={cn("relative", !dragging && "transition-transform duration-200")} style={{ transform: offset ? `translateX(${offset}px)` : undefined }}>
        {children}
      </div>
    </li>
  );
}

/** "Removed “Double GPO” · Undo", for a few seconds after a line is deleted. */
function UndoBar({ text, onUndo, onDone }: { text: string; onUndo: () => void; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const timer = setTimeout(() => done.current(), 6000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div role="status" className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center gap-3 rounded-lg border bg-card py-1 pr-1 pl-4 shadow-lg md:bottom-6">
      <span className="min-w-0 flex-1 truncate text-sm">{text}</span>
      <Button variant="ghost" className="text-primary" onClick={onUndo}>
        Undo
      </Button>
    </div>
  );
}

/** Swipe "Move to section": the quote's sections, no section, or a new one. */
function SectionSheet({ line, sections, onPick, onClose }: { line: LineJson; sections: string[]; onPick: (section: string | null) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const current = line.section?.trim() || null;
  const choices: { label: string; value: string | null }[] = [...sections.map((section) => ({ label: section, value: section })), { label: "No section", value: null }];
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title="Move to section" description={line.description.trim().slice(0, 80) || undefined}>
        <div className="flex flex-col gap-3 px-2 pb-2">
          <ul className="flex flex-col gap-2">
            {choices.map((choice) => (
              <li key={choice.label}>
                <button
                  type="button"
                  onClick={() => onPick(choice.value)}
                  className={cn("flex min-h-touch w-full items-center justify-between gap-3 rounded-md bg-muted/50 px-4 text-left hover:bg-muted", choice.value === current && "font-semibold ring-2 ring-primary")}
                >
                  {choice.label}
                  {choice.value === current && <span className="text-sm text-muted-foreground">Now</span>}
                </button>
              </li>
            ))}
          </ul>
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) onPick(name.trim());
            }}
          >
            <div className="flex-1">
              <Field label="New section" placeholder="e.g. Kitchen, Switchboard" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <Button type="submit" variant="outline" disabled={!name.trim()}>
              Move
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The + on Prices: add from the price book, or type a custom line. */
function AddLineSheet({ open, onOpenChange, onPriceBook, onCustom }: { open: boolean; onOpenChange: (open: boolean) => void; onPriceBook: () => void; onCustom: () => void }) {
  const choices = [
    { label: "Price book", description: "Labour and materials you've saved, at your prices", icon: Star, onClick: onPriceBook },
    { label: "Custom line", description: "Type in anything that isn't in the price book", icon: Plus, onClick: onCustom },
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent desktop="dialog" title="Add a line">
        <ul className="flex flex-col gap-2 px-2 pb-2">
          {choices.map((choice) => (
            <li key={choice.label}>
              <button
                type="button"
                onClick={choice.onClick}
                className="flex min-h-touch w-full items-center gap-3 rounded-md bg-muted/50 px-4 py-3 text-left hover:bg-muted active:bg-muted"
              >
                <choice.icon className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-medium">{choice.label}</span>
                  <span className="block text-sm text-muted-foreground">{choice.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
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
                      {item.kind === "LABOUR" ? "Labour" : "Material"} · {shown(item)} / {item.unit}{item.brand ? ` · ${item.brand}` : ""}
                    </span>
                  </span>
                  {added.includes(item.id) ? <Badge variant="success">Added{added.filter((addedId) => addedId === item.id).length > 1 ? ` ×${added.filter((addedId) => addedId === item.id).length}` : ""}</Badge> : <Plus className="size-5 text-primary" />}
                </button>
              </li>
            ))}
            {items?.length === 0 && (
              <li className="px-3 py-4 text-sm text-muted-foreground">
                {query ? "Nothing matches." : "Your price book is empty."} <a className="font-semibold underline" href="/quotes/price-book">Set up your price book</a>
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
      <SheetContent desktop="dialog" title={`Send ${quote.number} Rev ${nextRevision}`} description={`${total} · The PDF is saved as sent and won't change.`}>
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
        aria-label="Client link"
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
              {quote.viewedAt ? <strong>The client opened it {when(quote.viewedAt)}.</strong> : "Waiting for an answer."}
            </p>
            {link?.status === "OPEN" && link.url ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  The client can accept and sign, or decline, on this link until {new Date(link.expiresAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}. Codes go to {link.recipientEmail}.
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
                  <a href={`/quotes/${quote.id}/pdf/signed`}>
                    <FileText /> Signed PDF
                  </a>
                </Button>
              )}
              {quote.projectId && (
                <Button variant="outline" asChild>
                  <a href={`/jobs/${quote.projectId}`}>Open the job</a>
                </Button>
              )}
            </div>
            {signedOnline && link?.verifyCode && <p className="text-sm text-muted-foreground">Verify code {link.verifyCode}</p>}
          </div>
        )}
        {quote.status === "DECLINED" && <p>Declined{quote.declineReason ? `: ${quote.declineReason}` : "."}</p>}
        {quote.status === "WITHDRAWN" && <p>Withdrawn. The client&apos;s link no longer works.</p>}
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

export function AnswerSheet({ quote, kind, onClose, onDone }: { quote: QuoteJson; kind: "accept" | "decline"; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [createJob, setCreateJob] = useState(!quote.projectId);
  const action = useAction();
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog"
        title={kind === "accept" ? "Record acceptance" : "Record decline"}
        description={kind === "accept" ? "For a yes by phone, email or on paper. The client's link stops working." : "The client's link stops working."}
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
            if (kind === "accept" && createJob && projectId && !quote.projectId) window.location.href = `/jobs/${projectId}`;
            else onDone();
          }}
        >
          <TextArea label={kind === "accept" ? "How they accepted" : "Reason (optional)"} hint={kind === "accept" ? "e.g. Replied by email on Tuesday" : undefined} value={note} onChange={setNote} />
          {kind === "accept" && !quote.projectId && (
            <label className="flex items-center gap-3">
              <Checkbox checked={createJob} onCheckedChange={(checked) => setCreateJob(checked === true)} />
              <span>
                Make the job now
                {quote.siteAddress ? <span className="block text-sm text-muted-foreground">At {quote.siteAddress}</span> : <span className="block text-sm text-destructive">Add a site address to the quote first</span>}
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
                  <a href={`/quotes/${quote.id}/pdf/rev/${revision.id}`}>
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
          if (result) window.location.href = "/quotes";
        }}
      >
        Delete draft
      </Button>
    </div>
  );
}

