"use client";

// Settings › Custom icons (phase 4c part 3): the business's own icons for
// plans, built like the built-in ones (an outline and up to 3 letters, in a
// trade's colour) or uploaded as an SVG (made safe on the server). Below
// them, every built-in icon by trade: each can be given your own look
// (shape and letters, or an SVG); placed ones keep counting and pricing.
// Deleting takes an icon out of the library; ones already placed stay.

import { useMemo, useState } from "react";
import { ChevronDown, Plus, Trash2, Upload } from "lucide-react";
import { ActionButton, Alert, Badge, Button, EmptyState, Field, FormActions, List, PageHeader, SearchInput, Section, Segmented, SelectField, Sheet, SheetContent, Stack, api, useAction } from "@grid/ui";
import { CUSTOM_TRADE, ICON_OUTLINES, OUTLINE_NAMES, TRADES, customIcon, iconLookup, replacedIcon, type CustomIconRow, type IconOutline, type TradeIcon } from "../icons";
import { SVG_MAX_LENGTH, SvgError, sanitiseSvg } from "../svg";
import { IconGlyph } from "./IconGlyph";

const tradeOptions = [{ value: CUSTOM_TRADE.id, label: "Custom (its own group)" }, ...TRADES.map((trade) => ({ value: trade.id, label: trade.name }))];
const colourOf = (tradeId: string) => TRADES.find((trade) => trade.id === tradeId)?.colour ?? CUSTOM_TRADE.colour;

/** What the form is for: a new or existing own icon, or a built-in icon's look. */
type Editing = { row: CustomIconRow | null; builtIn: TradeIcon | null; tradeId: string };

export function CustomIcons({ initial, canManage }: { initial: CustomIconRow[]; canManage: boolean }) {
  const [rows, setRows] = useState(initial.filter((icon) => !icon.deleted));
  const [editing, setEditing] = useState<Editing | null>(null);
  const [query, setQuery] = useState("");
  const [openTrades, setOpenTrades] = useState<Set<string>>(new Set());
  const own = rows.filter((row) => !row.replacesKey);
  const replacements = useMemo(() => new Map(rows.filter((row) => row.replacesKey).map((row) => [row.replacesKey!, row])), [rows]);
  const lookup = useMemo(() => iconLookup(rows), [rows]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const builtInGroups = TRADES.map((trade) => ({
    trade,
    icons: trade.icons.filter((entry) => !words.length || words.every((word) => [entry.name, ...entry.words, trade.name, entry.label ?? ""].join(" ").toLowerCase().includes(word))),
  })).filter((group) => group.icons.length > 0);

  const saved = (row: CustomIconRow) => setRows((current) => (current.some((icon) => icon.id === row.id) ? current.map((icon) => (icon.id === row.id ? row : icon)) : [...current, row]));

  return (
    <>
      <PageHeader
        title="Custom icons"
        subtitle="Your own symbols for plans, and your own look for the built-in ones. They're counted and priced in take-offs like any other icon."
        actions={canManage && <ActionButton icon={<Plus />} label="New icon" onClick={() => setEditing({ row: null, builtIn: null, tradeId: CUSTOM_TRADE.id })} />}
      />
      <Stack>
        <Section title="Your icons" flush>
          {own.length === 0 ? (
            <EmptyState title="No custom icons yet">{canManage ? "Make one for anything the built-in library doesn't have, like a bollard light or a client's own fitting. Build it from a shape and letters, or upload an SVG." : "Your Owner or Foreman can add them."}</EmptyState>
          ) : (
            <List>
              {own.map((row) => (
                <li key={row.id}>
                  <button type="button" disabled={!canManage} onClick={() => setEditing({ row, builtIn: null, tradeId: row.trade })} className="flex min-h-touch-lg w-full items-center gap-3 px-4 py-2 text-left enabled:hover:bg-muted sm:px-6">
                    <span className="paper flex size-10 shrink-0 items-center justify-center rounded bg-white">
                      <IconGlyph icon={customIcon(row)} colour={colourOf(row.trade)} className="size-8" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{row.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {[tradeOptions.find((option) => option.value === row.trade)?.label.replace(" (its own group)", ""), row.svg ? "SVG" : null, row.words.join(", ")].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </List>
          )}
        </Section>

        <Section title="Built-in icons" description="Tap one to give it your own look, built here or from an SVG. Icons already on plans change too, and keep their counts, numbers and prices." flush>
          <div className="px-4 pb-3 sm:px-6">
            <SearchInput label="Search built-in icons" placeholder="e.g. GPO, smoke, tap" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="flex flex-col divide-y border-t">
            {builtInGroups.map(({ trade, icons }) => {
              const open = words.length > 0 || openTrades.has(trade.id);
              const changed = trade.icons.filter((entry) => replacements.has(entry.key)).length;
              return (
                <div key={trade.id}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenTrades((current) => (current.has(trade.id) ? new Set([...current].filter((id) => id !== trade.id)) : new Set([...current, trade.id])))}
                    className="flex min-h-touch w-full items-center gap-2 px-4 text-left font-semibold sm:px-6"
                  >
                    <span className="size-3 shrink-0 rounded-full" style={{ background: trade.colour }} />
                    <span className="flex-1">{trade.name}</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {icons.length} icons{changed ? ` · ${changed} yours` : ""}
                    </span>
                    <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <ul className="grid grid-cols-2 gap-1 px-3 pb-3 sm:grid-cols-3 sm:px-5 lg:grid-cols-4">
                      {icons.map((entry) => {
                        const row = replacements.get(entry.key) ?? null;
                        return (
                          <li key={entry.key}>
                            <button
                              type="button"
                              disabled={!canManage}
                              onClick={() => setEditing({ row, builtIn: entry, tradeId: trade.id })}
                              className="flex min-h-touch-lg w-full items-center gap-2 rounded-md p-2 text-left text-sm enabled:hover:bg-muted"
                            >
                              <span className="paper flex size-10 shrink-0 items-center justify-center rounded bg-white">
                                <IconGlyph icon={lookup.icon(entry.key) ?? entry} colour={trade.colour} className="size-8" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="line-clamp-2">{row?.name ?? entry.name}</span>
                                {row && <Badge variant="secondary">Your look</Badge>}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
            {builtInGroups.length === 0 && <p className="px-4 py-4 text-sm text-muted-foreground sm:px-6">No built-in icons match.</p>}
          </div>
        </Section>
      </Stack>
      {editing && (
        <IconForm
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={(row) => {
            saved(row);
            setEditing(null);
          }}
          onDeleted={(id) => {
            setRows((current) => current.filter((icon) => icon.id !== id));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

type Look = "shape" | "svg";

function IconForm({ editing, onClose, onSaved, onDeleted }: { editing: Editing; onClose: () => void; onSaved: (icon: CustomIconRow) => void; onDeleted: (id: string) => void }) {
  const { row: initial, builtIn } = editing;
  const [form, setForm] = useState({
    name: initial?.name ?? builtIn?.name ?? "",
    trade: initial?.trade ?? editing.tradeId,
    outline: (initial?.outline as IconOutline) ?? (builtIn && builtIn.outline !== "none" ? builtIn.outline : "circle"),
    label: initial?.label ?? builtIn?.label ?? "",
    words: initial?.words.join(", ") ?? "",
  });
  const [look, setLook] = useState<Look>(initial?.svg ? "svg" : "shape");
  const [svg, setSvg] = useState<string | null>(initial?.svg ?? null);
  const [tint, setTint] = useState(initial?.tint ?? false);
  const [svgError, setSvgError] = useState<string | null>(null);
  const action = useAction();
  const colour = colourOf(form.trade);

  const draft: CustomIconRow = {
    id: "00000000-0000-0000-0000-000000000000",
    trade: form.trade,
    name: form.name,
    words: [],
    outline: form.outline,
    label: form.label.slice(0, 3),
    svg: look === "svg" ? svg : null,
    tint,
    replacesKey: builtIn?.key ?? null,
    deleted: false,
  };
  const preview = builtIn ? replacedIcon(builtIn, draft) : customIcon(draft);

  const readFile = async (file: File | undefined) => {
    setSvgError(null);
    if (!file) return;
    if (file.size > SVG_MAX_LENGTH) return setSvgError("That SVG is too big for an icon (over 200 KB).");
    try {
      // The same checks the server does, so the preview is what you'll get.
      setSvg(sanitiseSvg(await file.text()));
    } catch (failure) {
      setSvgError(failure instanceof SvgError ? failure.message : "Couldn't read that file.");
    }
  };

  const title = builtIn ? `${initial ? "Change" : "Replace"} ${builtIn.name}` : initial ? "Change icon" : "New icon";
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        title={title}
        description={builtIn ? "Your own look for this built-in icon. It keeps its place in the library, and icons already on plans keep their counts and prices." : "Build it from a shape and letters, or upload an SVG."}
        desktop="dialog"
      >
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (look === "svg" && !svg) return setSvgError("Choose an SVG file first.");
            void action.run(async () => {
              const body = {
                name: form.name,
                trade: form.trade,
                outline: form.outline,
                label: look === "svg" ? "" : form.label,
                words: builtIn ? [] : form.words.split(",").map((word) => word.trim()).filter(Boolean),
                svg: look === "svg" ? svg : null,
                tint: look === "svg" && tint,
                replacesKey: builtIn?.key ?? null,
              };
              onSaved(await api<CustomIconRow>(initial ? `/markups/custom-icons/${initial.id}` : "/markups/custom-icons", { method: initial ? "PUT" : "POST", body }));
            });
          }}
        >
          <div className="flex items-center gap-4">
            <span className="paper flex size-16 shrink-0 items-center justify-center rounded-lg bg-white">
              <IconGlyph icon={preview} colour={colour} className="size-14" />
            </span>
            <Field label="Name" placeholder="e.g. Bollard light" value={form.name} maxLength={60} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </div>
          <Segmented<Look>
            label="Look"
            value={look}
            onChange={setLook}
            items={[
              { value: "shape", label: "Shape and letters" },
              { value: "svg", label: "SVG file" },
            ]}
          />
          {look === "shape" ? (
            <>
              <Field label="Letters (up to 3)" placeholder="e.g. BL" value={form.label} maxLength={3} onChange={(event) => setForm({ ...form, label: event.target.value.toUpperCase() })} required />
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Shape</span>
                <Segmented label="Shape" value={form.outline} onChange={(outline) => setForm({ ...form, outline })} items={ICON_OUTLINES.map((outline) => ({ value: outline, label: OUTLINE_NAMES[outline] }))} />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex min-h-touch cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input px-3 py-3 text-sm font-semibold hover:bg-muted">
                <Upload className="size-4" /> {svg ? "Choose a different SVG" : "Choose an SVG file"}
                <input type="file" accept=".svg,image/svg+xml" className="sr-only" onChange={(event) => void readFile(event.target.files?.[0])} />
              </label>
              <p className="text-xs text-muted-foreground">Square icons look best. Only the drawing is kept: scripts, links, embedded pictures and styles are taken out.</p>
              <Alert variant="error">{svgError}</Alert>
              <label className="flex min-h-touch items-center gap-3 text-sm">
                <input type="checkbox" className="size-5" checked={tint} onChange={(event) => setTint(event.target.checked)} />
                <span>
                  <span className="font-medium">Use the trade&apos;s colour</span>
                  <span className="block text-muted-foreground">Draws it all in one colour, like the rest of the library. Leave off to keep the SVG&apos;s own colours.</span>
                </span>
              </label>
            </div>
          )}
          {!builtIn && (
            <>
              <SelectField label="Trade" value={form.trade} onChange={(event) => setForm({ ...form, trade: event.target.value })} options={tradeOptions} hint="It shows in that trade's group in the library, in its colour." />
              <Field label="Other words for it (optional)" placeholder="e.g. garden, path light" value={form.words} onChange={(event) => setForm({ ...form, words: event.target.value })} hint="Separate with commas. The library search finds them." />
            </>
          )}
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            {initial && (
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    const question = builtIn ? `Put back the built-in look for ${builtIn.name}? Icons on plans change back too.` : `Take ${initial.name} out of the library? Ones already placed on plans stay.`;
                    if (!window.confirm(question)) return;
                    await api(`/markups/custom-icons/${initial.id}`, { method: "DELETE" });
                    onDeleted(initial.id);
                  })
                }
              >
                <Trash2 /> {builtIn ? "Put back the built-in" : "Delete"}
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
