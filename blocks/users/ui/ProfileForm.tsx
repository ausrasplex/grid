"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton, Alert, Button, EditablePicture, Field, FormActions, Loading, Section, Sheet, SheetContent, Stack, Switch, THEMES, api, cn, shareFile, themeAttributes, themeOf, useAction, useApi, type ThemeId } from "@grid/ui";
import { Share2 } from "lucide-react";

interface Me {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  sharePhotoOnCards: boolean;
  settings: Record<string, unknown>;
}

export function ProfileForm() {
  const { data, error, loading } = useApi<Me>("/users/me");
  const save = useAction();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  /** What's saved, so Save only shows once something's changed. */
  const [savedValues, setSavedValues] = useState({ name: "", phone: "" });
  const [saved, setSaved] = useState(false);
  /** The email shown, once changed here. */
  const [email, setEmail] = useState<string | null>(null);
  const [changingEmail, setChangingEmail] = useState(false);

  useEffect(() => {
    if (data) {
      setName(data.name);
      setPhone(data.phone ?? "");
      setSavedValues({ name: data.name, phone: data.phone ?? "" });
    }
  }, [data]);

  if (loading) return <Loading />;
  if (error || !data) return <Alert variant="error">{error ?? "Couldn't load your profile"}</Alert>;
  const changed = name !== savedValues.name || phone.trim() !== savedValues.phone;

  return (
    <Stack>
      <Section>
        <div className="flex flex-col gap-4">
          <ProfilePicture name={name || data.name} initial={data.avatarUrl} />
          <form
            className="flex flex-col gap-4 lg:max-w-2xl"
            onSubmit={async (event) => {
              event.preventDefault();
              setSaved(false);
              const ok = await save.run(() => api("/users/me", { method: "PATCH", body: { name, phone: phone.trim() || null } }));
              if (ok) {
                setSavedValues({ name, phone: phone.trim() });
                setSaved(true);
              }
            }}
          >
            <Field
              label="Name"
              autoComplete="name"
              value={name}
              onChange={(event) => (setName(event.target.value), setSaved(false))}
              required
              maxLength={120}
            />
            <Field
              label="Mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="04xx xxx xxx"
              value={phone}
              onChange={(event) => (setPhone(event.target.value), setSaved(false))}
              maxLength={30}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Email</span>
              <div className="flex min-h-touch items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{email ?? data.email}</span>
                <Button type="button" variant="ghost" className="shrink-0 text-primary" onClick={() => setChangingEmail(true)}>
                  Change
                </Button>
              </div>
            </div>
            <Alert variant="error">{save.error}</Alert>
            {changed ? (
              <FormActions>
                <Button type="submit" disabled={save.busy}>
                  {save.busy ? "Saving…" : "Save"}
                </Button>
              </FormActions>
            ) : (
              saved && <p className="text-sm text-muted-foreground">Saved</p>
            )}
          </form>
          <PhotoSharing initial={data.sharePhotoOnCards} />
        </div>
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
      <Appearance initial={themeOf(data.settings?.theme)} />
    </Stack>
  );
}

/** "Share photo on business cards": whether your own photo goes on cards, or your business's picture. Saves straight away. */
function PhotoSharing({ initial }: { initial: boolean }) {
  const [sharing, setSharing] = useState(initial);
  const action = useAction();
  const share = async (on: boolean) => {
    setSharing(on);
    const saved = await action.run(() => api("/users/me", { method: "PATCH", body: { sharePhotoOnCards: on } }));
    if (saved === undefined) setSharing(!on);
  };
  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <label className="flex min-h-touch items-center gap-3">
        <Switch checked={sharing} onCheckedChange={(on) => void share(on)} disabled={action.busy} />
        <span className="min-w-0">
          <span className="block font-medium">Share photo on business cards</span>
          <span className="block text-sm text-muted-foreground">{sharing ? "Cards include your photo" : "Cards show your business's picture"}</span>
        </span>
      </label>
      <Alert variant="error">{action.error}</Alert>
    </div>
  );
}

/** The page header's share button: your contact file (.vcf) to the phone's Share menu, or downloaded (the server names the file). */
export function ShareMyContact() {
  const action = useAction();
  return (
    <>
      <ActionButton
        variant="outline"
        icon={<Share2 />}
        label={action.busy ? "Getting it…" : "Share my contact"}
        disabled={action.busy}
        onClick={() => void action.run(() => shareFile("/api/clients/vcard/me", "Contact.vcf"))}
      />
      {action.error && <Alert variant="error">{action.error}</Alert>}
    </>
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

/**
 * Settings › Profile › Appearance: Grid's look, for you on every device.
 * Soft is a trial (docs/visual-style.md "Themes"). Applies straight away.
 */
function Appearance({ initial }: { initial: ThemeId }) {
  const router = useRouter();
  const [theme, setTheme] = useState<ThemeId>(initial);
  const action = useAction();

  const pick = async (next: ThemeId) => {
    if (next === theme) return;
    const previous = theme;
    setTheme(next);
    const ok = await action.run(() => api("/users/me", { method: "PATCH", body: { settings: { theme: next } } }));
    if (!ok) return setTheme(previous);
    // Show it now; the refresh brings the matching menus and Home.
    const root = document.documentElement;
    const attributes = themeAttributes(next);
    if (attributes["data-theme"]) root.setAttribute("data-theme", attributes["data-theme"]);
    else root.removeAttribute("data-theme");
    root.setAttribute("data-look", attributes["data-look"]);
    router.refresh();
  };

  return (
    <Section title="Appearance" description="How Grid looks for you">
      <div role="radiogroup" aria-label="Theme" className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {THEMES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={theme === option.id}
            disabled={action.busy}
            onClick={() => void pick(option.id)}
            className={cn(
              "flex min-h-touch items-center gap-3 rounded-xl border-2 px-3 py-2 text-left transition-colors",
              theme === option.id ? "border-primary bg-accent text-accent-foreground" : "border-transparent bg-muted hover:border-input",
            )}
          >
            <span aria-hidden className="flex shrink-0 -space-x-1.5">
              {SWATCHES[option.id].map((colour, index) => (
                <span key={index} className="size-5 rounded-full border-2 border-card" style={{ background: colour }} />
              ))}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{option.label}</span>
              {/* Only the one picked says what it is: the rest stay one line. */}
              {theme === option.id && <span className="block text-sm opacity-80">{option.description}</span>}
            </span>
          </button>
        ))}
      </div>
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
  const [url, setUrl] = useState(initial);
  const action = useAction();
  // Shown until you add your own (none when you're not in a business yet).
  const business = useApi<{ pictureUrl: string | null }>("/companies/current/picture");
  const fallback = business.data?.pictureUrl ?? null;

  const apply = async (request: () => Promise<{ avatarUrl: string | null }>) => {
    const result = await action.run(request);
    if (result) {
      setUrl(result.avatarUrl);
      router.refresh(); // the menu's picture too
    }
  };

  const upload = (file: File) =>
    apply(async () => {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/session/avatar", { method: "POST", body: form, credentials: "same-origin" });
      const body = (await response.json().catch(() => null)) as { avatarUrl?: string | null; error?: { message?: string } } | null;
      if (!response.ok || !body) throw new Error(body?.error?.message ?? "Couldn't upload the photo");
      return { avatarUrl: body.avatarUrl ?? null };
    });

  return (
    // Centred over the fields (which stop at 2xl wide on a big screen).
    <div className="flex flex-col items-center gap-2 lg:max-w-2xl">
      <EditablePicture
        name={name}
        src={url ?? fallback}
        canRemove={!!url}
        busy={action.busy}
        onPick={(file) => void upload(file)}
        onRemove={() => void apply(() => api<{ avatarUrl: string | null }>("/session/avatar", { method: "DELETE" }))}
        className="size-32"
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
