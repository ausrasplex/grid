"use client";

// Server admin: space used, the clean-up settings and "Run clean-up now".

import { useState } from "react";
import { Alert, Button, Field, FormActions, List, Section, SelectField, Stack, api, formatBytes, useAction, useApi } from "@grid/ui";

interface Settings {
  unfiledDays: number;
  deletedDays: number;
  mode: "on" | "dry-run" | "off";
  time: string;
}
interface Usage {
  businesses: { id: string; name: string; files: number; bytes: number }[];
  disk: { free: number; total: number } | null;
}

export function ServerStorage({ initial }: { initial: Settings }) {
  const { data: usage, reload } = useApi<Usage>("/storage/usage");
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [ran, setRan] = useState<string | null>(null);
  const save = useAction();
  const run = useAction();
  const total = usage?.businesses.reduce((total, business) => total + business.bytes, 0) ?? 0;

  return (
    <Stack>
      <Section title="Space used" description="Photos and their smaller copies, per business on this server." flush>
        <List>
          {usage?.businesses.map((business) => (
            <li key={business.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <span className="min-w-0 flex-1 truncate font-semibold">{business.name}</span>
              <span className="text-sm text-muted-foreground">{business.files} files</span>
              <span className="w-20 text-right font-semibold">{formatBytes(business.bytes)}</span>
            </li>
          ))}
          <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <span className="flex-1 font-semibold">Total</span>
            <span className="w-20 text-right font-bold">{formatBytes(total)}</span>
          </li>
          {usage?.disk && (
            <li className="px-4 py-3 text-sm text-muted-foreground sm:px-5">
              Free on the files share: {formatBytes(usage.disk.free)} of {formatBytes(usage.disk.total)}
            </li>
          )}
        </List>
      </Section>

      <Section title="Clean-up settings" description="For the whole server. Every business on it uses these.">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaved(false);
            if (await save.run(() => api("/storage/settings", { method: "PUT", body: settings }))) setSaved(true);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Remove unfiled uploads after (days)"
              type="number"
              min={1}
              max={365}
              value={settings.unfiledDays}
              onChange={(event) => setSettings({ ...settings, unfiledDays: Number(event.target.value) })}
              hint="Long enough for a phone that's been off to catch up."
            />
            <Field
              label="Keep Recently deleted for (days)"
              type="number"
              min={1}
              max={365}
              value={settings.deletedDays}
              onChange={(event) => setSettings({ ...settings, deletedDays: Number(event.target.value) })}
              hint="How long a deleted photo or note can be restored."
            />
            <SelectField
              label="Clean-up"
              value={settings.mode}
              onChange={(event) => setSettings({ ...settings, mode: event.target.value as Settings["mode"] })}
              options={[
                { value: "on", label: "On: remove things when their time is up" },
                { value: "dry-run", label: "Dry run: only list what would go" },
                { value: "off", label: "Off" },
              ]}
            />
            <Field label="Runs nightly at" type="time" value={settings.time} onChange={(event) => setSettings({ ...settings, time: event.target.value })} hint="Server time." />
          </div>
          <Alert variant="error">{save.error}</Alert>
          {saved && <Alert variant="success">Saved. Shorter times apply at the next clean-up.</Alert>}
          <FormActions>
            <Button type="submit" disabled={save.busy}>
              {save.busy ? "Saving…" : "Save settings"}
            </Button>
          </FormActions>
        </form>
      </Section>

      <Section title="Run clean-up now" description="Does tonight's clean-up straight away, including the weekly check for stray files on disk. Uses the settings above.">
        <div className="flex flex-col gap-3">
          <Alert variant="error">{run.error}</Alert>
          {ran && <Alert variant="success">{ran}</Alert>}
          <Button
            variant="outline"
            size="lg"
            disabled={run.busy}
            onClick={() =>
              run.run(async () => {
                const result = await api<{ ran: boolean; reason?: string; count?: number; bytes?: number; dryRun?: boolean }>("/storage/run", { body: {} });
                setRan(
                  !result.ran
                    ? (result.reason ?? "Didn't run")
                    : result.count
                      ? `${result.dryRun ? "Dry run: would remove" : "Removed"} ${result.count} item${result.count === 1 ? "" : "s"} (${formatBytes(result.bytes ?? 0)}). See the history below.`
                      : "Nothing was due for removal.",
                );
                reload();
                return true;
              })
            }
          >
            {run.busy ? "Running…" : "Run clean-up now"}
          </Button>
        </div>
      </Section>
    </Stack>
  );
}
