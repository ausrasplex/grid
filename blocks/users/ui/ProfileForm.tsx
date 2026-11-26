"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Avatar, Button, Field, FormActions, Loading, Section, Sheet, SheetContent, Stack, THEMES, api, cn, resolveTokens, showThemeNow, themeAttributes, tokensCss, useAction, useApi, type KeyColours, type ThemeId, type TokenOverrides } from "@grid/ui";

interface Me {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  settings: Record<string, unknown>;
}

export function ProfileForm() {
  const { data, error, loading } = useApi<Me>("/users/me");
  const save = useAction();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState(false);
  /** The email shown, once changed here. */
  const [email, setEmail] = useState<string | null>(null);
  const [changingEmail, setChangingEmail] = useState(false);

  useEffect(() => {
    if (data) {
      setName(data.name);
      setPhone(data.phone ?? "");
    }
  }, [data]);

  if (loading) return <Loading />;
  if (error || !data) return <Alert variant="error">{error ?? "Couldn't load your profile"}</Alert>;

  return (
    <Stack>
    <Section>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaved(false);
          const ok = await save.run(() =>
            api("/users/me", { method: "PATCH", body: { name, phone: phone.trim() || null } }),
          );
          if (ok) setSaved(true);
        }}
      >
        <ProfilePicture name={name || data.name} initial={data.avatarUrl} />
        <div className="flex flex-col gap-2 lg:max-w-2xl">
          <Field label="Email" value={email ?? data.email} disabled hint="Your sign-in email." />
          <Button type="button" variant="outline" className="self-start" onClick={() => setChangingEmail(true)}>
            Change email
          </Button>
        </div>
        <Field label="Name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
        <Field
          label="Mobile"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          maxLength={30}
        />
        <Alert variant="error">{save.error}</Alert>
        {saved && <Alert variant="success">Saved</Alert>}
        <FormActions>
          <Button type="submit" size="lg" disabled={save.busy}>
            {save.busy ? "Saving…" : "Save"}
          </Button>
        </FormActions>
      </form>
      <ChangeEmail
        open={changingEmail}
        onOpenChange={setChangingEmail}
        current={email ?? data.email}
        onChanged={(next) => {
          setEmail(next);
          setChangingEmail(false);
        }}
      />
    </Section>
    <Appearance initial={typeof data.settings?.theme === "string" ? data.settings.theme : "grid"} />
    </Stack>
  );
}

/** Small colour samples for each theme's card: page, card, main colour, tiles. */
const SWATCHES: Record<ThemeId, string[]> = {
  grid: ["#15171b", "#1f2228", "#f5d90a"],
  "grid-light": ["#f6f7f9", "#ffffff", "#c2410c"],
  soft: ["#f5f5f8", "#2b2a4c", "#b9a8f5", "#fbd8ae", "#e6f548"],
  "soft-dark": ["#14131f", "#2d2b52", "#b9a8f5", "#fbd8ae", "#e6f548"],
  "soft-system": ["#f5f5f8", "#14131f", "#b9a8f5", "#fbd8ae", "#e6f548"],
};

/** A theme someone made (the Themes block, /api/themes). */
interface CustomTheme {
  id: string;
  name: string;
  description: string;
  look: "grid" | "soft";
  keyColours: KeyColours;
  overrides: TokenOverrides;
  scope: "mine" | "business";
}

/** Page, cards, main colour, and the tiles in the Soft look. */
function customSwatches(theme: CustomTheme): string[] {
  const tokens = resolveTokens(theme.keyColours, theme.look, theme.overrides);
  return [tokens.background, tokens.card, tokens.primary, ...(theme.look === "soft" ? [tokens["tile-1"], tokens["tile-2"], tokens["tile-3"]] : [])];
}

/**
 * Settings › Profile › Appearance: Grid's look, for you on every device.
 * Soft is a trial (docs/visual-style.md "Themes"). Themes you or your
 * business made (Settings › Themes) are listed after the built-in ones,
 * as "custom:<id>". Applies straight away.
 */
function Appearance({ initial }: { initial: string }) {
  const router = useRouter();
  const [theme, setTheme] = useState<string>(initial);
  const action = useAction();
  const custom = useApi<{ mine: CustomTheme[]; business: CustomTheme[] }>("/themes");
  const made = [...(custom.data?.mine ?? []), ...(custom.data?.business ?? [])];

  const pick = async (next: string) => {
    if (next === theme) return;
    const previous = theme;
    setTheme(next);
    const ok = await action.run(() => api("/users/me", { method: "PATCH", body: { settings: { theme: next } } }));
    if (!ok) return setTheme(previous);
    // Show it now; the refresh brings the matching menus and Home.
    const mine = made.find((option) => `custom:${option.id}` === next);
    if (mine) showThemeNow({ "data-theme": "custom", "data-look": mine.look }, tokensCss(resolveTokens(mine.keyColours, mine.look, mine.overrides)));
    else showThemeNow(themeAttributes(next as ThemeId));
    router.refresh();
  };

  const option = (id: string, label: string, description: string, swatches: string[]) => (
    <button
      key={id}
      type="button"
      role="radio"
      aria-checked={theme === id}
      disabled={action.busy}
      onClick={() => void pick(id)}
      className={cn(
        "flex min-h-touch-lg items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors",
        theme === id ? "border-primary bg-accent text-accent-foreground" : "border-transparent bg-muted hover:border-input",
      )}
    >
      <span aria-hidden className="flex shrink-0 -space-x-1.5">
        {swatches.map((colour, index) => (
          <span key={index} className="size-6 rounded-full border-2 border-card" style={{ background: colour }} />
        ))}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold">{label}</span>
        <span className="block truncate text-sm opacity-80">{description}</span>
      </span>
    </button>
  );

  return (
    <Section
      title="Appearance"
      description="How Grid looks for you, on every device you sign in on. Soft is a trial look: try it and tell us."
      actions={
        <Button variant="ghost" size="sm" onClick={() => router.push("/themes/new")}>
          Make your own
        </Button>
      }
    >
      <div role="radiogroup" aria-label="Theme" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {THEMES.map((builtIn) => option(builtIn.id, builtIn.label, builtIn.description, SWATCHES[builtIn.id]))}
        {made.map((madeTheme) =>
          option(`custom:${madeTheme.id}`, madeTheme.name, madeTheme.description || (madeTheme.scope === "business" ? "The business's theme" : "Your theme"), customSwatches(madeTheme)),
        )}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        <a href="/themes" className="font-semibold text-primary underline-offset-4 hover:underline">
          Themes
        </a>{" "}
        is where you change the ones you&apos;ve made, export them, or share one with the business.
      </p>
      <Alert variant="error">{action.error}</Alert>
    </Section>
  );
}

/**
 * Your picture: shown in the menu and beside your name in the team. Grid
 * crops it square (it keeps the face in), so any photo will do.
 */
function ProfilePicture({ name, initial }: { name: string; initial: string | null }) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initial);
  const action = useAction();

  const apply = async (request: () => Promise<{ avatarUrl: string | null }>) => {
    const result = await action.run(request);
    if (result) {
      setUrl(result.avatarUrl);
      router.refresh(); // the menu's picture too
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Picture</span>
      <div className="flex items-center gap-4">
        <Avatar name={name} src={url} className="size-20 text-2xl" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={action.busy} onClick={() => picker.current?.click()}>
            {action.busy ? "Saving…" : url ? "Change picture" : "Add a picture"}
          </Button>
          {url && (
            <Button type="button" variant="ghost" disabled={action.busy} onClick={() => apply(() => api<{ avatarUrl: string | null }>("/session/avatar", { method: "DELETE" }))}>
              Remove
            </Button>
          )}
        </div>
      </div>
      <input
        ref={picker}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void apply(async () => {
            const form = new FormData();
            form.append("file", file);
            const response = await fetch("/api/session/avatar", { method: "POST", body: form, credentials: "same-origin" });
            const body = (await response.json().catch(() => null)) as { avatarUrl?: string | null; error?: { message?: string } } | null;
            if (!response.ok || !body) throw new Error(body?.error?.message ?? "Couldn't upload the photo");
            return { avatarUrl: body.avatarUrl ?? null };
          });
        }}
      />
      <Alert variant="error">{action.error}</Alert>
    </div>
  );
}

/** New email plus your current password (so a phone left signed in can't take the account). */
function ChangeEmail({ open, onOpenChange, current, onChanged }: { open: boolean; onOpenChange: (open: boolean) => void; current: string; onChanged: (email: string) => void }) {
  const [next, setNext] = useState("");
  const [password, setPassword] = useState("");
  const action = useAction();
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) (setNext(""), setPassword(""), action.setError(null));
      }}
    >
      <SheetContent desktop="dialog" title="Change your email" description={`You sign in with ${current} now.`}>
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await action.run(() => api<{ email: string }>("/session/email", { body: { email: next, password } }));
            if (result) {
              onChanged(result.email);
              setNext("");
              setPassword("");
            }
          }}
        >
          <Field label="New email" type="email" inputMode="email" autoComplete="email" value={next} onChange={(event) => setNext(event.target.value)} required autoFocus />
          <Field
            label="Your current password"
            type="password"
            autoComplete="current-password"
            hint="To check it's you."
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <p className="text-sm text-muted-foreground">From now on you&apos;ll sign in with the new email. Your password stays the same, and we&apos;ll let your old address know.</p>
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={action.busy || !next.trim() || !password}>
              {action.busy ? "Changing…" : "Change email"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}
