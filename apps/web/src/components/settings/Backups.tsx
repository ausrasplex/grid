"use client";

// Settings › Backups (server admin): what to include, when, how many to
// keep; Back up now; and the history with Download per backup.

import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  FormActions,
  Icon,
  Loading,
  Section,
  SelectField,
  Stack,
  api,
  cn,
  formatBytes,
  useAction,
  useApi,
} from "@grid/ui";

interface Settings {
  includeDatabase: boolean;
  includeMedia: boolean;
  schedule: "off" | "daily" | "weekly";
  day: number;
  time: string;
  keep: number;
}
interface Run {
  id: string;
  trigger: "schedule" | "manual";
  by: string | null;
  includesDb: boolean;
  includesMedia: boolean;
  status: "running" | "done" | "failed";
  folder: string;
  startedAt: string;
  finishedAt: string | null;
  dbBytes: number;
  mediaBytes: number;
  mediaFiles: number;
  newMediaBytes: number;
  error: string | null;
  pinned: boolean;
  deletedAt: string | null;
}
interface List {
  next: string | null;
  usage: { bytes: number; disk: { free: number; total: number } | null };
  runs: Run[];
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const when = (value: string) => new Date(value).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
function took(start: string, end: string | null) {
  if (!end) return "";
  const seconds = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.round(seconds / 60)} min`;
}

function Tick({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-touch items-start gap-3 py-1">
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary)]" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <span className="font-semibold">{label}</span>
        {hint && <span className="block text-sm text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

export function Backups({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [now, setNow] = useState({ db: initial.includeDatabase, media: initial.includeMedia });
  const save = useAction();
  const start = useAction();
  const action = useAction();
  const { data, reload, loading } = useApi<List>("/backups");
  const running = data?.runs.some((run) => run.status === "running");

  // Keep the history live while a backup runs.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(reload, 3000);
    return () => clearInterval(timer);
  }, [running, reload]);

  const set = <K extends keyof Settings>(field: K, value: Settings[K]) => {
    setSettings({ ...settings, [field]: value });
    setSaved(false);
  };

  return (
    <Stack>
      {data?.runs[0]?.status === "failed" && (
        <Alert variant="error">The last backup failed: {data.runs[0].error}</Alert>
      )}

      <Section title="Back up now" description="Starts straight away and runs in the background. You can leave this page.">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:gap-6">
            <Tick checked={now.db} onChange={(value) => setNow({ ...now, db: value })} label="Database" />
            <Tick checked={now.media} onChange={(value) => setNow({ ...now, media: value })} label="Media (photos)" />
          </div>
          <Alert variant="error">{start.error}</Alert>
          <Button
            size="lg"
            disabled={start.busy || running || (!now.db && !now.media)}
            onClick={() =>
              start.run(async () => {
                await api("/backups/run", { body: { includeDatabase: now.db, includeMedia: now.media } });
                reload();
                return true;
              })
            }
          >
            <Icon name="archive" /> {running ? "Backing up…" : "Back up now"}
          </Button>
        </div>
      </Section>

      <Section title="History" description="Newest first. Download any finished backup as one .tar file." flush>
        {loading && !data ? (
          <div className="px-4 pb-4 sm:px-5">
            <Loading rows={3} />
          </div>
        ) : !data?.runs.length ? (
          <EmptyState title="No backups yet" />
        ) : (
          <>
            <Alert variant="error">{action.error}</Alert>
            <ul className="divide-y">
              {data.runs.map((run) => {
                const gone = !!run.deletedAt;
                const total = run.dbBytes + run.mediaBytes;
                return (
                  <li key={run.id} className={cn("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5", gone && "opacity-60")}>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {when(run.startedAt)}
                        {run.status === "running" && <Badge>Running</Badge>}
                        {run.status === "failed" && <Badge variant="destructive">Failed</Badge>}
                        {run.pinned && !gone && <Badge variant="default">Kept forever</Badge>}
                        {gone && <Badge>Removed</Badge>}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {[
                          run.trigger === "schedule" ? "Scheduled" : `Manual${run.by ? ` (${run.by})` : ""}`,
                          [run.includesDb && "Database", run.includesMedia && "Media"].filter(Boolean).join(" + "),
                          run.status === "done" ? formatBytes(total) : null,
                          run.status === "done" && run.includesMedia ? `${run.mediaFiles} files, ${formatBytes(run.newMediaBytes)} new` : null,
                          run.status !== "running" ? took(run.startedAt, run.finishedAt) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {run.status === "failed" && run.error && <p className="text-sm text-destructive">{run.error}</p>}
                    </div>
                    {run.status === "done" && !gone && (
                      <div className="flex shrink-0 gap-1">
                        <Button asChild variant="outline" size="sm">
                          <a
                            href={`/api/backups/${run.id}/download`}
                            onClick={(event) => {
                              if (!window.confirm("This file holds everything on the server, including password hashes and the encryption key. Keep it somewhere safe. Download it?")) event.preventDefault();
                            }}
                          >
                            <Icon name="arrow-down" /> Download
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={action.busy}
                          onClick={() => action.run(async () => (await api(`/backups/${run.id}/pin`, { body: { pinned: !run.pinned } }), reload(), true))}
                        >
                          {run.pinned ? "Unpin" : "Keep forever"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={action.busy}
                          onClick={() =>
                            action.run(async () => {
                              if (!window.confirm("Delete this backup? This can't be undone.")) return false;
                              await api(`/backups/${run.id}`, { method: "DELETE" });
                              reload();
                              return true;
                            })
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {data && (
          <p className="px-4 py-3 text-sm text-muted-foreground sm:px-5">
            {data.next ? `Next scheduled backup: ${when(data.next)}. ` : "Scheduled backups are off. "}
            Backups use {formatBytes(data.usage.bytes)}
            {data.usage.disk ? `; ${formatBytes(data.usage.disk.free)} free on the backups share.` : "."}
          </p>
        )}
      </Section>

      <Section title="Schedule and what to keep" description="For the whole server.">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaved(false);
            if (await save.run(() => api("/backups/settings", { method: "PUT", body: settings }))) {
              setSaved(true);
              reload();
            }
          }}
        >
          <div>
            <p className="mb-1 text-sm font-medium">Scheduled backups include</p>
            <Tick checked={settings.includeDatabase} onChange={(value) => set("includeDatabase", value)} label="Database" hint="Every business, job, note and setting. Small and quick." />
            <Tick checked={settings.includeMedia} onChange={(value) => set("includeMedia", value)} label="Media (photos)" hint="Only new photos take extra space; the rest are shared with the previous backup." />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              label="How often"
              value={settings.schedule}
              onChange={(event) => set("schedule", event.target.value as Settings["schedule"])}
              options={[
                { value: "daily", label: "Every day" },
                { value: "weekly", label: "Once a week" },
                { value: "off", label: "Off (Back up now only)" },
              ]}
            />
            {settings.schedule === "weekly" && (
              <SelectField label="Day" value={String(settings.day)} onChange={(event) => set("day", Number(event.target.value))} options={DAYS.map((day, index) => ({ value: String(index), label: day }))} />
            )}
            {settings.schedule !== "off" && <Field label="Time" type="time" value={settings.time} onChange={(event) => set("time", event.target.value)} hint="Server time." />}
          </div>
          <Field
            label="Keep the latest"
            type="number"
            min={1}
            max={100}
            value={settings.keep}
            onChange={(event) => set("keep", Number(event.target.value))}
            hint="backups. When a new one finishes, the oldest beyond this is removed. Backups you keep forever don't count."
          />
          <Alert variant="error">{save.error}</Alert>
          {saved && <Alert variant="success">Saved.</Alert>}
          <FormActions>
            <Button type="submit" disabled={save.busy}>
              {save.busy ? "Saving…" : "Save"}
            </Button>
          </FormActions>
        </form>
      </Section>
    </Stack>
  );
}
