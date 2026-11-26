"use client";

// Make or change a theme (/themes/new, /themes/<id>). Simple first: start
// from a built-in theme, pick the look and a few colours, and Grid works out
// the rest. Advanced lists every colour for anyone who wants to set one by
// hand. The preview shows it as you go; hard-to-read pairs get a warning.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Check, ChevronDown, Copy, Download, Home, Map as MapIcon, RotateCcw, Search, Share2, Trash2 } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Field,
  FormActions,
  KEY_COLOURS,
  Loading,
  PageHeader,
  STARTERS,
  Section,
  Segmented,
  Sheet,
  SheetContent,
  Stack,
  THEME_TOKENS,
  HEX_COLOUR,
  api,
  cn,
  readabilityWarnings,
  resolveTokens,
  deriveTokens,
  showThemeNow,
  tokensCss,
  starterOf,
  tokenStyle,
  useAction,
  useApi,
  type KeyColourName,
  type KeyColours,
  type ThemeTokens,
  type TokenName,
  type TokenOverrides,
} from "@grid/ui";
import { Swatches, downloadTheme, useUseTheme, type ThemeJson, type ThemeList } from "./shared";

type Look = "grid" | "soft";

interface Draft {
  name: string;
  description: string;
  look: Look;
  startedFrom: string;
  keyColours: KeyColours;
  overrides: TokenOverrides;
}

function newDraft(from: string | null): Draft {
  const starter = starterOf(from);
  return { name: "", description: "", look: starter.look, startedFrom: starter.id, keyColours: { ...starter.keyColours }, overrides: {} };
}

/** /themes/new: a blank draft. ?from=soft starts from that theme; ?for=business makes it the business's. */
export function NewTheme() {
  const search = useSearchParams();
  const { data } = useApi<ThemeList>("/themes");
  const scope = search.get("for") === "business" && data?.canManageBusiness ? "business" : "mine";
  return <ThemeEditor initial={newDraft(search.get("from"))} scope={scope} canManageBusiness={!!data?.canManageBusiness} />;
}

/** /themes/<id>: an existing theme. */
export function EditTheme({ id }: { id: string }) {
  const theme = useApi<ThemeJson>(`/themes/${id}`);
  const list = useApi<ThemeList>("/themes");
  if (theme.loading || list.loading) return <Loading rows={5} />;
  if (theme.error || !theme.data) return <Alert variant="error">{theme.error ?? "Couldn't load the theme"}</Alert>;
  const { name, description, look, startedFrom, keyColours, overrides } = theme.data;
  return (
    <ThemeEditor
      key={theme.data.updatedAt}
      saved={theme.data}
      initial={{ name, description, look, startedFrom, keyColours, overrides }}
      scope={theme.data.scope}
      canManageBusiness={!!list.data?.canManageBusiness}
      inUse={list.data?.current === `custom:${id}`}
    />
  );
}

function ThemeEditor({
  saved,
  initial,
  scope,
  canManageBusiness,
  inUse = false,
}: {
  saved?: ThemeJson;
  initial: Draft;
  scope: "mine" | "business";
  canManageBusiness: boolean;
  inUse?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [deleting, setDeleting] = useState(false);
  const save = useAction();
  const other = useAction();
  const chooser = useUseTheme();
  const readOnly = !!saved && !saved.canEdit;
  const changed = JSON.stringify(draft) !== JSON.stringify(initial);

  const tokens = useMemo(() => resolveTokens(draft.keyColours, draft.look, draft.overrides), [draft]);
  const workedOut = useMemo(() => deriveTokens(draft.keyColours, draft.look), [draft.keyColours, draft.look]);
  const warnings = useMemo(() => readabilityWarnings(tokens, draft.look), [tokens, draft.look]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!changed || readOnly) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed, readOnly]);

  const setKey = (name: KeyColourName, value: string) => setDraft((current) => ({ ...current, keyColours: { ...current.keyColours, [name]: value } }));
  const setOverride = (name: TokenName, value: string | null) =>
    setDraft((current) => {
      const overrides = { ...current.overrides };
      if (value === null) delete overrides[name];
      else overrides[name] = value;
      return { ...current, overrides };
    });
  const startFrom = (id: string) => {
    const starter = starterOf(id);
    setDraft((current) => ({ ...current, startedFrom: starter.id, look: starter.look, keyColours: { ...starter.keyColours }, overrides: {} }));
  };

  const submit = async (andUse: boolean) => {
    const body = { ...draft, name: draft.name.trim() };
    const result = await save.run(() =>
      saved ? api<ThemeJson>(`/themes/${saved.id}`, { method: "PUT", body }) : api<ThemeJson>("/themes", { body: { ...body, scope } }),
    );
    if (!result) return;
    if (andUse) await chooser.use(result);
    // Already using it: show the new colours now (the refresh brings the rest).
    else if (inUse) showThemeNow({ "data-theme": "custom", "data-look": result.look }, tokensCss(resolveTokens(result.keyColours, result.look, result.overrides)));
    if (saved) router.refresh();
    router.push(`/themes/${result.id}`);
  };

  const copy = async (toScope: "mine" | "business") => {
    if (!saved) return;
    const result = await other.run(() => api<ThemeJson>(`/themes/${saved.id}/copy`, { body: { scope: toScope } }));
    if (result) router.push(`/themes/${result.id}`);
  };

  const title = saved ? (readOnly ? saved.name : `Edit ${saved.name}`) : scope === "business" ? "New business theme" : "New theme";
  const preview = <Preview tokens={tokens} look={draft.look} name={draft.name.trim() || "Your theme"} />;

  return (
    <>
      <PageHeader
        title={title}
        meta={
          saved ? (
            <span className="flex flex-wrap items-center gap-2">
              {saved.scope === "business" ? "The business's theme" : "Your theme"}
              {inUse && <Badge variant="success">In use</Badge>}
            </span>
          ) : undefined
        }
      />
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Stack>
          {readOnly && (
            <Alert>
              {saved?.scope === "business" ? "Only the Owner can change the business's themes." : "This theme isn't yours."} Make a copy to change it your way.
            </Alert>
          )}

          <Section title="Name">
            <div className="flex flex-col gap-4">
              <Field label="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Sparky blue" maxLength={80} required disabled={readOnly} />
              <Field label="Description" hint="Optional. Shown under the name." value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={200} disabled={readOnly} />
            </div>
          </Section>

          {!readOnly && (
            <Section title="Start from" description={saved ? "Starting again sets every colour back to that theme's." : "Its colours fill in below. Change any of them."}>
              <div role="radiogroup" aria-label="Start from" className="grid gap-2 sm:grid-cols-2">
                {STARTERS.map((starter) => (
                  <button
                    key={starter.id}
                    type="button"
                    role="radio"
                    aria-checked={draft.startedFrom === starter.id}
                    onClick={() => startFrom(starter.id)}
                    className={cn(
                      "flex min-h-touch-lg items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors",
                      draft.startedFrom === starter.id ? "border-primary bg-accent text-accent-foreground" : "border-transparent bg-muted hover:border-input",
                    )}
                  >
                    <Swatches theme={{ keyColours: starter.keyColours, look: starter.look, overrides: {} }} />
                    <span className="font-semibold">{starter.label}</span>
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section title="Look" description={draft.look === "soft" ? "Soft: rounder corners, pill buttons and the Plus Jakarta Sans font, with Home's big card and tiles." : "Grid: lightly rounded corners and your device's own font."}>
            <Segmented
              label="Look"
              value={draft.look}
              onChange={(look) => !readOnly && setDraft({ ...draft, look })}
              items={[
                { value: "grid", label: "Grid" },
                { value: "soft", label: "Soft" },
              ]}
            />
          </Section>

          <Section title="Colours" description="Grid works out the rest (lines, chips, hover, menus) from these.">
            <div className="flex flex-col gap-1">
              {KEY_COLOURS.filter((colour) => draft.look === "soft" || !colour.softOnly).map((colour) => (
                <ColourRow
                  key={colour.name}
                  label={colour.label}
                  hint={colour.hint}
                  value={draft.keyColours[colour.name]}
                  onChange={(value) => setKey(colour.name, value)}
                  disabled={readOnly}
                />
              ))}
            </div>
          </Section>

          <div className="lg:hidden">{preview}</div>

          <Readability warnings={warnings} tokens={tokens} />

          <Advanced tokens={tokens} workedOut={workedOut} overrides={draft.overrides} look={draft.look} onChange={setOverride} disabled={readOnly} />

          <Alert variant="error">{save.error ?? other.error ?? chooser.error}</Alert>
          <FormActions>
            {saved && !readOnly && (
              <Button type="button" variant="ghost" size="lg" className="sm:mr-auto text-destructive" onClick={() => setDeleting(true)}>
                <Trash2 /> Delete
              </Button>
            )}
            {saved && (
              <Button type="button" variant="outline" size="lg" disabled={other.busy} onClick={() => other.run(() => downloadTheme(saved))}>
                <Download /> Export
              </Button>
            )}
            {saved && (
              <Button type="button" variant="outline" size="lg" disabled={other.busy} onClick={() => copy("mine")}>
                <Copy /> {readOnly ? "Make a copy" : "Copy"}
              </Button>
            )}
            {saved?.scope === "mine" && canManageBusiness && (
              <Button type="button" variant="outline" size="lg" disabled={other.busy} onClick={() => copy("business")}>
                <Share2 /> Share with the business
              </Button>
            )}
            {saved && !inUse && !changed && (
              <Button type="button" variant={readOnly ? "default" : "outline"} size="lg" disabled={chooser.busy} onClick={async () => (await chooser.use(saved)) && router.refresh()}>
                <Check /> Use this theme
              </Button>
            )}
            {!readOnly && (
              <>
                {(!saved || !inUse) && (
                  <Button type="button" variant="outline" size="lg" disabled={save.busy || !draft.name.trim() || (!!saved && !changed)} onClick={() => submit(true)}>
                    Save and use
                  </Button>
                )}
                <Button type="button" size="lg" disabled={save.busy || !draft.name.trim() || (!!saved && !changed)} onClick={() => submit(false)}>
                  {save.busy ? "Saving…" : "Save"}
                </Button>
              </>
            )}
          </FormActions>
        </Stack>

        <div className="hidden lg:block">
          <div className="sticky top-24">{preview}</div>
        </div>
      </div>

      {saved && (
        <DeleteTheme
          open={deleting}
          onOpenChange={setDeleting}
          theme={saved}
          onDeleted={() => {
            router.push("/themes");
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/** One colour: a big tap target that opens the device's colour picker, and the code to type or paste. */
function ColourRow({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [typed, setTyped] = useState(value);
  useEffect(() => setTyped(value), [value]);
  return (
    <div className="flex min-h-touch-lg items-center gap-3 py-1.5">
      <label className="relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-input" style={{ background: value }}>
        <span className="sr-only">{label}: pick a colour</span>
        <input type="color" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value.toLowerCase())} className="absolute inset-0 size-full cursor-pointer opacity-0" />
      </label>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-sm text-muted-foreground">{hint}</span>}
      </span>
      <input
        aria-label={`${label} colour code`}
        value={typed}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="off"
        onChange={(event) => {
          const next = event.target.value.trim();
          setTyped(next);
          const withHash = next.startsWith("#") ? next : `#${next}`;
          if (HEX_COLOUR.test(withHash)) onChange(withHash.toLowerCase());
        }}
        onBlur={() => setTyped(value)}
        className="h-touch w-[6.5rem] shrink-0 rounded-md border border-input bg-card px-3 font-mono text-base uppercase"
      />
    </div>
  );
}

/** Pairs of colours that are hard to read, worst first. A warning only: saving still works. */
function Readability({ warnings, tokens }: { warnings: ReturnType<typeof readabilityWarnings>; tokens: ThemeTokens }) {
  if (!warnings.length) {
    return (
      <Alert variant="success">
        <span className="font-semibold">Easy to read.</span> Every bit of text stands out from what&apos;s behind it, even out in the sun.
      </Alert>
    );
  }
  return (
    <Section title="Hard to read" description="These won't stand out well, especially outside in bright sun. Try a lighter or darker colour, or set the text colour under Every colour.">
      <ul className="flex flex-col gap-2">
        {warnings.map((warning) => (
          <li key={warning.label} className="flex min-h-touch items-center gap-3 rounded-lg bg-muted px-3 py-2">
            <span aria-hidden className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md border text-sm font-bold" style={{ background: tokens[warning.background], color: tokens[warning.text] }}>
              Aa
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{warning.label}</span>
              <span className="block text-sm text-muted-foreground">
                {warning.ratio} : 1, aim for {warning.needs} : 1 or more
              </span>
            </span>
            <AlertTriangle aria-hidden className="size-5 shrink-0 text-warning" />
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Every one of Grid's colours: worked out, or set by hand. */
function Advanced({
  tokens,
  workedOut,
  overrides,
  look,
  onChange,
  disabled,
}: {
  tokens: ThemeTokens;
  workedOut: ThemeTokens;
  overrides: TokenOverrides;
  look: Look;
  onChange: (name: TokenName, value: string | null) => void;
  disabled?: boolean;
}) {
  const setByHand = Object.keys(overrides).length;
  const groups = [...new Set(THEME_TOKENS.map((token) => token.group))].filter((group) => look === "soft" || !group.startsWith("Home"));
  return (
    <details className="group rounded-(--card-radius) bg-card">
      <summary className="flex min-h-touch-lg cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Every colour (advanced)</span>
          <span className="block text-sm text-muted-foreground">{setByHand ? `${setByHand} set by hand, the rest worked out` : "All worked out from your colours above"}</span>
        </span>
        <ChevronDown aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-5 px-4 pb-4 sm:px-6 sm:pb-6">
        {setByHand > 0 && !disabled && (
          <Button variant="outline" className="self-start" onClick={() => Object.keys(overrides).forEach((name) => onChange(name as TokenName, null))}>
            <RotateCcw /> Work them all out again
          </Button>
        )}
        {groups.map((group) => (
          <div key={group}>
            <h3 className="mb-1 text-sm font-semibold text-muted-foreground">{group}</h3>
            {THEME_TOKENS.filter((token) => token.group === group).map((token) => {
              const byHand = token.name in overrides;
              return (
                <div key={token.name} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <ColourRow
                      label={token.label}
                      hint={byHand ? `Set by hand (worked out: ${workedOut[token.name].toUpperCase()})` : "Worked out"}
                      value={tokens[token.name]}
                      onChange={(value) => onChange(token.name, value)}
                      disabled={disabled}
                    />
                  </div>
                  {byHand && !disabled && (
                    <Button variant="ghost" size="icon" aria-label={`Work out ${token.label} again`} title="Work it out again" onClick={() => onChange(token.name, null)}>
                      <RotateCcw />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </details>
  );
}

/** The shapes of each look, so the preview shows them whatever theme you're using now. */
const LOOK_SHAPES: Record<Look, CSSProperties> = {
  grid: {
    "--radius": "10px",
    "--corner-sm": "4px",
    "--corner-md": "6px",
    "--corner-lg": "10px",
    "--corner-xl": "14px",
    "--corner-2xl": "18px",
    "--card-radius": "14px",
    "--radius-button": "6px",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  } as CSSProperties,
  soft: {
    "--radius": "14px",
    "--corner-sm": "8px",
    "--corner-md": "12px",
    "--corner-lg": "14px",
    "--corner-xl": "16px",
    "--corner-2xl": "24px",
    "--card-radius": "24px",
    "--radius-button": "9999px",
    fontFamily: "var(--font-soft), system-ui, sans-serif",
  } as CSSProperties,
};

/** A small, made-up screen in the theme: a job card, chips, a box, statuses, and the phone bar. */
function Preview({ tokens, look, name }: { tokens: ThemeTokens; look: Look; name: string }) {
  const style = { ...tokenStyle(tokens), ...LOOK_SHAPES[look] } as CSSProperties;
  return (
    <section aria-label="Preview" className="overflow-hidden rounded-(--corner-2xl) border bg-background text-foreground" style={style}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">Preview</span>
        <span className="truncate pl-3 text-xs text-muted-foreground">{name}</span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div>
          <p className="text-xl font-bold leading-tight">Smith St fit-out</p>
          <p className="text-xs font-medium text-muted-foreground">Job 2611 · Level 2 · 14 photos</p>
        </div>

        {look === "soft" && (
          <div className="rounded-[18px] bg-hero p-3 text-hero-foreground">
            <p className="font-semibold">3 active jobs on 2 sites.</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(["tile-1", "tile-2", "tile-3"] as const).map((tile, index) => (
                <div key={tile} className="rounded-(--corner-xl) p-2 text-tile-foreground" style={{ background: tokens[tile] }}>
                  <p className="text-xs font-semibold">0{index + 1}</p>
                  <p className="text-sm font-bold">{["Jobs", "Quotes", "Wallet"][index]}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-(--card-radius) bg-card p-3 text-card-foreground">
          <p className="font-semibold">On site now</p>
          <p className="text-sm text-muted-foreground">Unit 4 · switchboard and lighting</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PreviewButton className="bg-primary text-primary-foreground">Take a photo</PreviewButton>
            <PreviewButton className="border border-input bg-card">Plans</PreviewButton>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-(--corner-md) bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground">Mine</span>
          <span className="rounded-(--corner-md) bg-muted px-3 py-1.5 text-sm font-semibold">All</span>
          <span className="rounded-(--corner-sm) bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">New</span>
        </div>

        <div className="flex h-11 items-center gap-2 rounded-(--corner-md) border border-input bg-card px-3 text-sm text-muted-foreground">
          <Search aria-hidden className="size-4" /> Jump to a job
        </div>

        <div className="rounded-(--card-radius) bg-card text-sm">
          {[
            { label: "Test & tag", status: "Done", colour: tokens.success },
            { label: "White Card", status: "Due Fri", colour: tokens.warning },
            { label: "EWP licence", status: "Expired", colour: tokens.destructive },
            { label: "Plans rev C", status: "Info", colour: tokens.info },
          ].map((row, index) => (
            <div key={row.label} className={cn("flex items-center justify-between px-3 py-2", index > 0 && "border-t")}>
              <span>{row.label}</span>
              <span className="rounded-(--corner-sm) border px-2 py-0.5 text-xs font-semibold" style={{ color: row.colour, borderColor: row.colour }}>
                {row.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-around border-t bg-dock px-2 pb-2 pt-1.5">
        <PreviewTab icon={<Home />} label="Home" active look={look} />
        <PreviewTab icon={<MapIcon />} label="Sites" look={look} />
        <PreviewTab icon={<Search />} label="Jump" look={look} />
      </div>
    </section>
  );
}

function PreviewButton({ className, children }: { className: string; children: ReactNode }) {
  return <span className={cn("inline-flex h-10 items-center rounded-(--radius-button) px-4 text-sm font-semibold", className)}>{children}</span>;
}

function PreviewTab({ icon, label, active = false, look }: { icon: ReactNode; label: string; active?: boolean; look: Look }) {
  return (
    <span
      className={cn(
        "flex w-16 flex-col items-center gap-0.5 rounded-(--corner-md) py-1 text-[11px] font-semibold [&_svg]:size-5",
        active ? "text-nav-active" : "text-nav-foreground",
        active && look === "soft" && "bg-accent text-accent-foreground",
        active && look === "grid" && "border-t-2 border-nav-active",
      )}
    >
      {icon}
      {label}
    </span>
  );
}

function DeleteTheme({ open, onOpenChange, theme, onDeleted }: { open: boolean; onOpenChange: (open: boolean) => void; theme: ThemeJson; onDeleted: () => void }) {
  const action = useAction();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent desktop="dialog" title={`Delete ${theme.name}?`} description={theme.scope === "business" ? "Anyone in the business using it goes back to Grid." : "If you're using it, Grid goes back to its usual colours."}>
        <div className="flex flex-col gap-4 px-2">
          <p className="text-sm text-muted-foreground">Export it first if you might want it again.</p>
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              size="lg"
              disabled={action.busy}
              onClick={async () => {
                const ok = await action.run(() => api(`/themes/${theme.id}`, { method: "DELETE" }));
                if (ok) onDeleted();
              }}
            >
              {action.busy ? "Deleting…" : "Delete theme"}
            </Button>
          </FormActions>
        </div>
      </SheetContent>
    </Sheet>
  );
}
