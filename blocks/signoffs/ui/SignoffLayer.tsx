"use client";

// Row sign-offs in the spreadsheet viewer (docs/documents-block.md "Row
// sign-offs"), drawn through the viewer's "documents.sheet" slot:
//   - a sign-off box at the start of every row (tap to sign off, again to undo)
//   - progress and To do / Signed off / All in the bar above the sheet
//   - who and when, the history and a note on the row card
//   - a menu: the match column, sign-offs that don't match this version,
//     Download with sign-offs, Clear this sheet
// Sign-offs made with no signal wait on the phone and go when it's back.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, Circle, CircleCheck, CloudOff, MoreHorizontal } from "lucide-react";
import {
  Alert,
  ApiError,
  Button,
  Field,
  FormActions,
  SelectField,
  Segmented,
  Sheet,
  SheetContent,
  SheetRowCard,
  SheetToolbar,
  api,
  cn,
  newId,
  useAction,
  useSheetColumn,
  useSheetFilter,
  useSheetSlot,
  type SheetColumn,
} from "@grid/ui";
import { guessMatchColumn, headersOf, matchColumnFor, rowKeys, rowStates, rowText, type SignoffEntry } from "../keys";
import { addPending, pendingFor, removePending, type PendingSignoff } from "./outbox";

export interface SignoffsJson {
  entries: SignoffEntry[];
  matchColumns: Record<string, string | null>;
  archived: boolean;
  canDownload: boolean;
}

type Mode = "all" | "todo" | "done";
const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function SignoffLayer({
  documentId,
  initial,
  me,
  permissions,
  canDownload,
}: {
  documentId: string;
  initial: SignoffsJson;
  me: { id: string; name: string };
  permissions: { sign: boolean; manage: boolean };
  canDownload: boolean;
}) {
  const { panel, sheet } = useSheetSlot();
  const [data, setData] = useState(initial);
  const [pending, setPending] = useState<PendingSignoff[]>([]);
  const [mode, setMode] = useState<Mode>("all");
  const [menu, setMenu] = useState<"menu" | "match" | "unmatched" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const action = useAction();
  const sending = useRef(false);

  const canSign = permissions.sign && panel.version.isCurrent && !data.archived;

  // --- sending (and waiting for signal) -------------------------------------
  const flush = useCallback(async () => {
    if (sending.current) return;
    const waiting = pendingFor(documentId);
    if (!waiting.length) return;
    sending.current = true;
    try {
      const result = await api<{ entries: SignoffEntry[] }>(`/signoffs/doc/${documentId}/entries`, {
        body: { entries: waiting.map(({ documentId: _documentId, ...entry }) => entry) },
      });
      removePending(waiting.map((entry) => entry.id));
      setData((current) => ({ ...current, entries: result.entries }));
      setPending(pendingFor(documentId));
    } catch (failure) {
      // Refused (not allowed, archived…): drop them and say why. No signal: keep them for later.
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500) {
        removePending(waiting.map((entry) => entry.id));
        setPending(pendingFor(documentId));
        setError(failure.message);
      }
    } finally {
      sending.current = false;
    }
  }, [documentId]);

  useEffect(() => {
    setPending(pendingFor(documentId));
    void flush();
    const retry = () => void flush();
    window.addEventListener("online", retry);
    const timer = setInterval(retry, 30_000);
    return () => {
      window.removeEventListener("online", retry);
      clearInterval(timer);
    };
  }, [documentId, flush]);

  // --- where each row stands --------------------------------------------------
  const entries = useMemo(() => {
    const sent = new Set(data.entries.map((entry) => entry.id));
    return [...data.entries, ...pending.filter((entry) => !sent.has(entry.id)).map(({ documentId: _documentId, ...entry }) => ({ ...entry, byId: me.id, byName: me.name }))];
  }, [data.entries, pending, me]);
  const waitingIds = useMemo(() => new Set(pending.map((entry) => entry.id)), [pending]);

  const setting = sheet ? (data.matchColumns[sheet.name] ?? null) : null;
  const matchColumn = sheet ? matchColumnFor(sheet.cells, sheet.headerRow, setting) : null;
  const keys = useMemo(() => (sheet ? rowKeys(sheet.cells, sheet.headerRow, matchColumn) : []), [sheet, matchColumn]);
  const states = useMemo(() => (sheet ? rowStates(entries, sheet.name) : new Map()), [entries, sheet]);
  const keySet = useMemo(() => new Set(keys.filter((key): key is string => !!key)), [keys]);
  const total = keySet.size;
  const done = [...keySet].filter((key) => states.get(key)?.signedOff).length;
  const unmatched = useMemo(() => [...states.entries()].filter(([key, state]) => state.signedOff && !keySet.has(key)), [states, keySet]);

  const record = useCallback(
    (row: number, signedOff: boolean, withNote: string | null = null) => {
      if (!sheet) return;
      const key = keys[row];
      if (!key) return;
      const state = states.get(key);
      if (!signedOff && state?.by && state.by.byId !== me.id && !permissions.manage) {
        setError(`${state.by.byName} signed that row off. Only someone who manages sign-offs can undo it.`);
        return;
      }
      setError(null);
      const item: PendingSignoff = { documentId, id: newId(), sheetName: sheet.name, rowKey: key, signedOff, note: withNote, rowText: rowText(sheet.cells[row] ?? []), at: new Date().toISOString() };
      addPending(item);
      setPending((current) => [...current, item]);
      void flush();
    },
    [sheet, keys, states, me.id, permissions.manage, documentId, flush],
  );

  // --- the column, the filter --------------------------------------------------
  const column = useMemo<SheetColumn | null>(() => {
    if (!sheet) return null;
    return {
      width: 40,
      order: 10,
      header: <CheckCheck className="size-[1.1em] text-muted-foreground" aria-label="Signed off" />,
      cell: (row) => {
        const key = keys[row];
        if (!key) return null;
        const state = states.get(key);
        const signed = !!state?.signedOff;
        const waiting = !!state?.history.length && waitingIds.has(state.history[state.history.length - 1]!.id);
        const label = signed ? `Signed off by ${state!.by!.byName}, ${when(state!.by!.at)}${canSign ? ". Tap to undo" : ""}` : canSign ? "Sign off this row" : "Not signed off";
        return (
          <button
            type="button"
            aria-pressed={signed}
            aria-label={label}
            title={label}
            disabled={!canSign}
            onClick={() => record(row, !signed)}
            className="flex size-full items-center justify-center disabled:cursor-default"
          >
            {signed ? <CircleCheck className={cn("size-[1.3em] text-success", waiting && "opacity-60")} /> : <Circle className="size-[1.3em] text-muted-foreground/40" />}
          </button>
        );
      },
    };
  }, [sheet, keys, states, waitingIds, canSign, record]);
  useSheetColumn(column);

  const filter = useMemo(() => {
    if (mode === "all") return null;
    return (row: number) => {
      const key = keys[row];
      if (!key) return false;
      const signed = !!states.get(key)?.signedOff;
      return mode === "done" ? signed : !signed;
    };
  }, [mode, keys, states]);
  useSheetFilter(filter);

  if (!sheet) return null;
  const headers = headersOf(sheet.cells, sheet.headerRow).filter(Boolean);
  const guess = guessMatchColumn(sheet.cells, sheet.headerRow);

  return (
    <>
      <SheetToolbar>
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="text-sm font-semibold tabular-nums" aria-live="polite">
            {done} of {total} signed off
          </span>
          <div className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-muted sm:max-w-48" aria-hidden>
            <div className="h-full rounded-full bg-success" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
          {pending.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CloudOff className="size-3.5" /> {pending.length} waiting for signal
            </span>
          )}
          <Segmented
            label="Show rows"
            value={mode}
            onChange={setMode}
            className="sm:ml-auto"
            items={[
              { value: "all", label: "All" },
              { value: "todo", label: "To do", count: total - done },
              { value: "done", label: "Signed off", count: done },
            ]}
          />
          <Button variant="ghost" size="icon" aria-label="Sign-off options" onClick={() => setMenu("menu")}>
            <MoreHorizontal />
          </Button>
        </div>
        {!panel.version.isCurrent && <p className="w-full text-xs text-muted-foreground">An older version: sign-offs show here, but rows are signed off on the current one.</p>}
        {data.archived && <p className="w-full text-xs text-muted-foreground">This job is archived: restore it to sign off rows.</p>}
        {unmatched.length > 0 && (
          <button type="button" onClick={() => setMenu("unmatched")} className="min-h-touch w-full rounded-md border border-warning/50 bg-warning/15 px-3 text-left text-sm font-medium">
            {unmatched.length} sign-off{unmatched.length === 1 ? " doesn't" : "s don't"} match a row in this version
          </button>
        )}
        {error && (
          <div className="w-full">
            <Alert variant="error">{error}</Alert>
          </div>
        )}
      </SheetToolbar>

      <SheetRowCard>
        {(row) => {
          const key = keys[row];
          if (!key) return null;
          const state = states.get(key);
          const signed = !!state?.signedOff;
          return (
            <div className="flex flex-col gap-3 border-t py-3">
              <p className="font-semibold">{signed ? `Signed off by ${state!.by!.byName}, ${when(state!.by!.at)}` : "Not signed off yet"}</p>
              {signed && state!.by!.note && <p className="text-sm">“{state!.by!.note}”</p>}
              {canSign && (
                <div className="flex flex-col gap-2">
                  {!signed && <Field label="Note (optional)" placeholder="e.g. Tested, reads 21.4 °C" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />}
                  <Button
                    variant={signed ? "outline" : "default"}
                    size="lg"
                    onClick={() => {
                      record(row, !signed, signed ? null : note.trim() || null);
                      setNote("");
                    }}
                  >
                    {signed ? "Undo sign-off" : "Sign off this row"}
                  </Button>
                </div>
              )}
              {state && state.history.length > 0 && (
                <details>
                  <summary className="min-h-touch cursor-pointer content-center text-sm text-muted-foreground">History ({state.history.length})</summary>
                  <ul className="flex flex-col gap-1 text-sm">
                    {[...state.history].reverse().map((entry) => (
                      <li key={entry.id}>
                        {entry.signedOff ? "Signed off" : "Undone"} by {entry.byName}, {when(entry.at)}
                        {entry.note ? `: “${entry.note}”` : ""}
                        {waitingIds.has(entry.id) ? " (waiting for signal)" : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        }}
      </SheetRowCard>

      <Sheet open={menu === "menu"} onOpenChange={(open) => !open && setMenu(null)}>
        <SheetContent title="Sign-offs" description={`${sheet.name}: ${done} of ${total} rows signed off.`}>
          <div className="flex flex-col gap-2 px-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Rows are matched by <strong>{matchColumn ?? "the whole row"}</strong>
              {setting === null ? " (Grid's guess)" : ""}, so sign-offs follow their row when a new version moves or adds rows.
            </p>
            {permissions.manage && panel.version.isCurrent && !data.archived && (
              <Button variant="outline" size="lg" onClick={() => setMenu("match")}>
                Change the match column
              </Button>
            )}
            {canDownload && (
              <Button variant="outline" size="lg" onClick={() => (window.location.href = `/api/signoffs/doc/${documentId}/export`)}>
                Download with sign-offs
              </Button>
            )}
            {unmatched.length > 0 && (
              <Button variant="outline" size="lg" onClick={() => setMenu("unmatched")}>
                Sign-offs that don&apos;t match ({unmatched.length})
              </Button>
            )}
            {permissions.manage && panel.version.isCurrent && !data.archived && done > 0 && (
              <Button
                variant="outline"
                size="lg"
                className="text-destructive"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    if (!window.confirm(`Undo all ${done} sign-offs on ${sheet.name}? They stay in each row's history.`)) return;
                    const signedKeys = [...keySet].filter((key) => states.get(key)?.signedOff);
                    setData(await api<SignoffsJson>(`/signoffs/doc/${documentId}/clear`, { body: { sheetName: sheet.name, rowKeys: signedKeys } }));
                    setMenu(null);
                  })
                }
              >
                Clear this sheet
              </Button>
            )}
            <Alert variant="error">{action.error}</Alert>
          </div>
        </SheetContent>
      </Sheet>

      {menu === "match" && (
        <MatchColumnSheet
          sheetName={sheet.name}
          headers={headers}
          guess={guess}
          setting={setting}
          onSave={async (matchColumn) => {
            setData(await api<SignoffsJson>(`/signoffs/doc/${documentId}/match`, { method: "PUT", body: { sheetName: sheet.name, matchColumn } }));
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}

      <Sheet open={menu === "unmatched"} onOpenChange={(open) => !open && setMenu(null)}>
        <SheetContent title="Sign-offs that don't match" description={`These rows were signed off, but no row on this version of ${sheet.name} matches them (it was removed, or its ${matchColumn ?? "text"} changed). They're kept until someone clears them.`}>
          <div className="flex flex-col gap-3 px-4 pb-4">
            <ul className="flex flex-col divide-y">
              {unmatched.map(([key, state]) => (
                <li key={key} className="py-2">
                  <span className="block font-medium">{state.by?.rowText || key}</span>
                  <span className="block text-sm text-muted-foreground">
                    Signed off by {state.by?.byName}, {state.by ? when(state.by.at) : ""}
                  </span>
                </li>
              ))}
            </ul>
            {permissions.manage && panel.version.isCurrent && !data.archived && (
              <FormActions>
                <Button
                  variant="outline"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      setData(await api<SignoffsJson>(`/signoffs/doc/${documentId}/clear`, { body: { sheetName: sheet.name, rowKeys: unmatched.map(([key]) => key) } }));
                      setMenu(null);
                    })
                  }
                >
                  Clear these
                </Button>
              </FormActions>
            )}
            <Alert variant="error">{action.error}</Alert>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Which column names each row ("Point name"), or the whole row. */
function MatchColumnSheet({
  sheetName,
  headers,
  guess,
  setting,
  onSave,
  onClose,
}: {
  sheetName: string;
  headers: string[];
  guess: string | null;
  setting: string | null;
  onSave: (matchColumn: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(setting === null ? "@guess" : setting === "" ? "@row" : setting);
  const action = useAction();
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        desktop="dialog"
        title="Match rows by"
        description={`A column whose value names each row on ${sheetName} (Point name, Tag, Circuit). New versions can move rows around and sign-offs still find theirs. Sign-offs already made move with the change.`}
      >
        <div className="flex flex-col gap-3 px-2">
          <SelectField
            label="Column"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            options={[
              { value: "@guess", label: `Grid's guess (${guess ?? "the whole row"})` },
              { value: "@row", label: "The whole row (no column names it)" },
              ...headers.map((header) => ({ value: header, label: header })),
            ]}
          />
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={action.busy} onClick={() => void action.run(() => onSave(value === "@guess" ? null : value === "@row" ? "" : value))}>
              {action.busy ? "Saving…" : "Save"}
            </Button>
          </FormActions>
        </div>
      </SheetContent>
    </Sheet>
  );
}
