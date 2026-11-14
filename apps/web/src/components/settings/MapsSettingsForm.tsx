"use client";

// Settings › Maps (server admin): Google address suggestions. Paste the API
// key, test it, turn it on. The key is stored encrypted and stays on the server.

import { useState } from "react";
import { Alert, Button, Field, FormActions, Section, Stack, api, useAction } from "@grid/ui";

interface Settings {
  enabled: boolean;
  country: string;
  hasKey: boolean;
}

export function MapsSettingsForm({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useAction();
  const test = useAction();
  const keyField = apiKey.trim() ? { apiKey: apiKey.trim() } : clearKey ? { apiKey: "" } : {};

  return (
    <Stack>
      {!initial.enabled && (
        <Alert>Address suggestions are off. Address boxes work as normal; people just type the whole address.</Alert>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setSaved(false);
          const result = await save.run(() => api<Settings>("/server/maps", { method: "PUT", body: { enabled: settings.enabled, country: settings.country, ...keyField } }));
          if (result) {
            setSettings(result);
            setApiKey("");
            setClearKey(false);
            setSaved(true);
          }
        }}
      >
        <Stack>
          <Section title="Google address suggestions" description="As people type an address, Grid suggests real ones from Google Maps. Picking one fills in the whole address.">
            <div className="flex flex-col gap-4">
              <label className="flex min-h-touch items-center gap-3">
                <input
                  type="checkbox"
                  className="size-5 accent-[var(--color-primary)]"
                  checked={settings.enabled}
                  onChange={(event) => (setSettings({ ...settings, enabled: event.target.checked }), setSaved(false))}
                />
                <span className="font-medium">Suggest addresses while typing</span>
              </label>
              <Field
                label="Google Maps API key"
                type="password"
                autoComplete="off"
                placeholder={settings.hasKey && !clearKey ? "Saved (type a new one to replace it)" : "Paste the key"}
                value={apiKey}
                onChange={(event) => (setApiKey(event.target.value), setClearKey(false), setSaved(false))}
                hint="Stored encrypted on this server and never sent to anyone's browser."
              />
              {settings.hasKey && !apiKey && (
                <label className="flex min-h-touch items-center gap-3 text-sm">
                  <input type="checkbox" className="size-5 accent-[var(--color-primary)]" checked={clearKey} onChange={(event) => setClearKey(event.target.checked)} />
                  Remove the saved key
                </label>
              )}
              <Field
                label="Country"
                hint="Two letters: au for Australia only. Leave blank for anywhere."
                maxLength={2}
                value={settings.country}
                onChange={(event) => (setSettings({ ...settings, country: event.target.value.toLowerCase() }), setSaved(false))}
              />
            </div>
          </Section>

          <Section title="Getting a key" description="About ten minutes, once.">
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
              <li>
                Go to <span className="font-medium">console.cloud.google.com</span>, sign in and create a project (e.g. &ldquo;Grid&rdquo;). Google asks for billing details; address
                suggestions for a business this size usually stay inside Google&apos;s free monthly allowance.
              </li>
              <li>
                Under <span className="font-medium">APIs &amp; Services › Library</span>, turn on <span className="font-medium">Places API (New)</span>.
              </li>
              <li>
                Under <span className="font-medium">APIs &amp; Services › Credentials</span>, create an <span className="font-medium">API key</span>. Restrict it to the Places API (New); as it&apos;s
                only used by this server, you can also restrict it to your server&apos;s internet address.
              </li>
              <li>Paste it above, tap Test, then Save.</li>
            </ol>
          </Section>

          <Alert variant="error">{save.error}</Alert>
          {saved && <Alert variant="success">Saved</Alert>}
          {testResult && <Alert variant={testResult.ok ? "success" : "error"}>{testResult.message}</Alert>}
          <FormActions>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={test.busy}
              onClick={async () => {
                setTestResult(null);
                const result = await test.run(() => api<{ ok: boolean; message: string }>("/server/maps/test", { body: { country: settings.country, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) } }));
                if (result) setTestResult(result);
              }}
            >
              {test.busy ? "Testing…" : "Test"}
            </Button>
            <Button type="submit" size="lg" disabled={save.busy}>
              {save.busy ? "Saving…" : "Save"}
            </Button>
          </FormActions>
        </Stack>
      </form>
    </Stack>
  );
}
