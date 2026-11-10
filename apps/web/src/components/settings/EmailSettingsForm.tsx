"use client";

// Settings › Email (server admin). Pick a provider to fill in the usual
// server details, add the login, send a test, save.

import { useState } from "react";
import { Alert, Button, Field, FormActions, Section, SelectField, Stack, api, useAction } from "@grid/ui";

type Security = "ssl" | "starttls" | "none";
interface Settings {
  enabled: boolean;
  host: string;
  port: number;
  security: Security;
  username: string;
  fromName: string;
  fromAddress: string;
  hasPassword: boolean;
}

/** Common providers' server details. The login is still yours to fill in. */
const PROVIDERS: Record<string, { label: string; host: string; port: number; security: Security; note?: string }> = {
  google: { label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: 465, security: "ssl", note: "Use an app password (Google Account › Security › App passwords), not your normal password." },
  microsoft: { label: "Microsoft 365 / Outlook", host: "smtp.office365.com", port: 587, security: "starttls", note: "Your Microsoft 365 admin may need to allow \"Authenticated SMTP\" for this mailbox." },
  zoho: { label: "Zoho Mail (Australia)", host: "smtppro.zoho.com.au", port: 465, security: "ssl" },
  icloud: { label: "iCloud Mail", host: "smtp.mail.me.com", port: 587, security: "starttls", note: "Use an app-specific password from your Apple Account." },
  other: { label: "Other (your host's details)", host: "", port: 465, security: "ssl" },
};

function guessProvider(host: string) {
  return Object.entries(PROVIDERS).find(([, provider]) => provider.host && provider.host === host)?.[0] ?? (host ? "other" : "");
}

export function EmailSettingsForm({ initial, defaultTestTo }: { initial: Settings; defaultTestTo: string }) {
  const [settings, setSettings] = useState(initial);
  const [provider, setProvider] = useState(guessProvider(initial.host));
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [testTo, setTestTo] = useState(defaultTestTo);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useAction();
  const test = useAction();
  const set = <K extends keyof Settings>(field: K, value: Settings[K]) => {
    setSettings({ ...settings, [field]: value });
    setSaved(false);
  };
  const note = provider ? PROVIDERS[provider]?.note : undefined;
  const passwordField = password ? { password } : clearPassword ? { password: "" } : {};

  return (
    <Stack>
      {!initial.enabled && (
        <Alert>
          Email is off. Until it's on, people sign in with a password, and sign-in links and password resets are only written to the server log.
        </Alert>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const { hasPassword: _h, ...body } = settings;
          const updated = await save.run(() => api<Settings>("/server/email", { method: "PUT", body: { ...body, ...passwordField } }));
          if (updated) {
            setSettings(updated);
            setPassword("");
            setClearPassword(false);
            setSaved(true);
          }
        }}
      >
        <Stack>
          <Section title="Email server">
            <div className="flex flex-col gap-4">
              <label className="flex min-h-touch items-center gap-3 font-semibold">
                <input type="checkbox" className="size-5 accent-[var(--color-primary)]" checked={settings.enabled} onChange={(event) => set("enabled", event.target.checked)} />
                Send emails from Grid
              </label>
              <SelectField
                label="Provider"
                value={provider}
                onChange={(event) => {
                  const provider = PROVIDERS[event.target.value];
                  setProvider(event.target.value);
                  if (provider && event.target.value !== "other") setSettings({ ...settings, host: provider.host, port: provider.port, security: provider.security });
                  setSaved(false);
                }}
                options={[{ value: "", label: "Choose…" }, ...Object.entries(PROVIDERS).map(([value, provider]) => ({ value, label: provider.label }))]}
              />
              {note && <Alert>{note}</Alert>}
              <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                <Field label="Server (SMTP host)" value={settings.host} onChange={(event) => set("host", event.target.value.trim())} placeholder="smtp.example.com" autoComplete="off" />
                <Field label="Port" type="number" inputMode="numeric" value={settings.port} onChange={(event) => set("port", Number(event.target.value))} />
              </div>
              <SelectField
                label="Security"
                value={settings.security}
                onChange={(event) => set("security", event.target.value as Security)}
                options={[
                  { value: "ssl", label: "SSL/TLS (usually port 465)" },
                  { value: "starttls", label: "STARTTLS (usually port 587)" },
                  { value: "none", label: "None (only for a mail server on your own network)" },
                ]}
              />
              <Field label="Username" value={settings.username} onChange={(event) => set("username", event.target.value)} autoComplete="off" hint="Usually the full email address." />
              <Field
                label="Password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setSaved(false);
                }}
                placeholder={settings.hasPassword && !clearPassword ? "Saved (leave blank to keep it)" : ""}
                hint="Stored encrypted. It's never shown again."
              />
              {settings.hasPassword && !password && (
                <label className="flex min-h-touch items-center gap-3 text-sm">
                  <input type="checkbox" className="size-5 accent-[var(--color-primary)]" checked={clearPassword} onChange={(event) => setClearPassword(event.target.checked)} />
                  Remove the saved password
                </label>
              )}
            </div>
          </Section>

          <Section title="Sent from">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From name" value={settings.fromName} onChange={(event) => set("fromName", event.target.value)} placeholder="Morelli Electrical" />
              <Field label="From address" type="email" value={settings.fromAddress} onChange={(event) => set("fromAddress", event.target.value.trim())} placeholder="jobs@example.com.au" hint="Most providers only allow your own address here." />
            </div>
          </Section>

          <Section title="Send a test" description="Tries the details above before you save them.">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Field label="Send it to" type="email" value={testTo} onChange={(event) => setTestTo(event.target.value)} />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={test.busy}
                onClick={() =>
                  test.run(async () => {
                    setTestResult(null);
                    const { hasPassword: _h, enabled: _e, ...rest } = settings;
                    setTestResult(await api<{ ok: boolean; message?: string }>("/server/email/test", { body: { ...rest, ...(password ? { password } : {}), to: testTo } }));
                    return true;
                  })
                }
              >
                {test.busy ? "Sending…" : "Send test email"}
              </Button>
            </div>
            <div className="mt-3">
              <Alert variant="error">{test.error}</Alert>
              {testResult &&
                (testResult.ok ? (
                  <Alert variant="success">Sent. Check {testTo} (and its junk folder).</Alert>
                ) : (
                  <Alert variant="error">The email server said: {testResult.message}</Alert>
                ))}
            </div>
          </Section>

          <Alert variant="error">{save.error}</Alert>
          {saved && <Alert variant="success">Saved. Grid uses these details from the next email it sends.</Alert>}
          <FormActions>
            <Button type="submit" size="lg" disabled={save.busy}>
              {save.busy ? "Saving…" : "Save"}
            </Button>
          </FormActions>
        </Stack>
      </form>
    </Stack>
  );
}
