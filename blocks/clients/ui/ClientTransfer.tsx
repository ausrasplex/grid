"use client";

// Export and import on the Clients page (docs/quotations-block.md "Export
// and import"): the Export & import sheet (download the list, Share our
// card, start an import) and the import page with its preview.
//
// Files are read here, on the phone or computer; the server only gets the
// cells, works out the matches and saves.

import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Building2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Alert, Badge, Button, Checkbox, EmptyState, FormActions, List, PageHeader, Section, Segmented, Sheet, SheetContent, Stack, api, buttonVariants, cn, useAction } from "@grid/ui";
import { COLUMNS, type Decision, type FieldChange, type ImportPlan, type PlannedBusiness, type PlannedPerson } from "../transfer";

type Format = "xlsx" | "csv";

interface MemberJson {
  membershipId: string;
  status: string;
  user: { id: string; name: string; email: string; phone: string | null };
}

// ---------------------------------------------------------------------------
// The sheet on the Clients page
// ---------------------------------------------------------------------------

export function TransferSheet({ open, onClose, canExport, canImport, canSeeTeam }: { open: boolean; onClose: () => void; canExport: boolean; canImport: boolean; canSeeTeam: boolean }) {
  const [format, setFormat] = useState<Format>("xlsx");
  const [showCard, setShowCard] = useState(false);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && (setShowCard(false), onClose())}>
      <SheetContent desktop="dialog" title={showCard ? "Our business card" : "Export & import"} description={showCard ? undefined : "Contact cards only: never accounts or access to Grid."}>
        {showCard ? (
          <OurCard format={format} canSeeTeam={canSeeTeam} onBack={() => setShowCard(false)} />
        ) : (
          <Stack>
            {canExport && (
              <>
                <Segmented<Format>
                  label="File type"
                  value={format}
                  onChange={setFormat}
                  items={[
                    { value: "xlsx", label: "Excel" },
                    { value: "csv", label: "CSV" },
                  ]}
                />
                <a href={`/api/clients/export?format=${format}`} download className={cn(buttonVariants({ variant: "outline" }), "w-full justify-start")}>
                  <Download /> Export the client list
                </a>
                <p className="-mt-2 text-sm text-muted-foreground">Every business and person on the list, one row per person.</p>
                <Button variant="outline" className="w-full justify-start" onClick={() => setShowCard(true)}>
                  <Building2 /> Share our business card
                </Button>
                <p className="-mt-2 text-sm text-muted-foreground">Your business and the team members you pick, for another business to import as clients.</p>
              </>
            )}
            {canImport && (
              <>
                <a href="/clients/import" className={cn(buttonVariants({ variant: "outline" }), "w-full justify-start")}>
                  <Upload /> Import from a file
                </a>
                <p className="-mt-2 text-sm text-muted-foreground">From a Grid export, a business card, or other software. You see what it would do before anything is saved.</p>
              </>
            )}
          </Stack>
        )}
      </SheetContent>
    </Sheet>
  );
}

function OurCard({ format, canSeeTeam, onBack }: { format: Format; canSeeTeam: boolean; onBack: () => void }) {
  const [members, setMembers] = useState<MemberJson[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!canSeeTeam) return setMembers([]);
    api<MemberJson[]>("/companies/current/members")
      .then((rows) => setMembers(rows.filter((member) => member.status === "ACTIVE")))
      .catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)));
  }, [canSeeTeam]);
  const toggle = (membershipId: string, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(membershipId);
      else next.delete(membershipId);
      return next;
    });
  const link = `/api/clients/export/card?format=${format}${picked.size ? `&members=${[...picked].join(",")}` : ""}`;

  return (
    <Stack>
      <p className="text-sm text-muted-foreground">Your business's name and ABN, with the phone, email and address from Settings › Branding. Tick who else goes on it: their name, email and phone.</p>
      {error && <Alert variant="error">{error}</Alert>}
      {members === null ? (
        <p className="text-muted-foreground">Loading the team…</p>
      ) : members.length > 0 ? (
        <ul className="flex flex-col">
          {members.map((member) => (
            <li key={member.membershipId}>
              <label className="flex min-h-touch items-center gap-3 rounded-md px-1 hover:bg-muted">
                <Checkbox checked={picked.has(member.membershipId)} onCheckedChange={(state) => toggle(member.membershipId, state === true)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{member.user.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">{[member.user.email, member.user.phone].filter(Boolean).join(" · ")}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Just the business: you can't see the team from here.</p>
      )}
      <FormActions>
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <a href={link} download className={buttonVariants()}>
          <Download /> Download
        </a>
      </FormActions>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// The import page
// ---------------------------------------------------------------------------

interface Preview extends ImportPlan {
  columnsFound: string[];
  canAdd: boolean;
  canUpdate: boolean;
}

interface ImportResult {
  businessesAdded: number;
  businessesUpdated: number;
  peopleAdded: number;
  peopleUpdated: number;
  peopleLeftOut: number;
}

/** The first sheet of a CSV or Excel file, row by row. CSV cells stay as typed (0400… keeps its 0). */
async function readFileCells(file: File): Promise<unknown[][]> {
  const XLSX = await import("xlsx");
  const isText = /\.(csv|txt|tsv)$/i.test(file.name);
  const workbook = XLSX.read(await file.arrayBuffer(), { raw: isText, dense: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]!];
  if (!firstSheet) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, raw: false, defval: "", blankrows: true });
}

/** An empty file with the headings, to fill in by hand. */
async function downloadBlank() {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[...COLUMNS]]), "Clients");
  XLSX.writeFile(workbook, "Clients to import.xlsx");
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const isMatchWithChanges = (planned: PlannedBusiness | PlannedPerson) => !!planned.match && (planned.changes.length > 0 || ("movesBusiness" in planned && planned.movesBusiness));

export function ImportClients() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [cells, setCells] = useState<unknown[][] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [businessChoices, setBusinessChoices] = useState<Record<string, Decision>>({});
  const [personChoices, setPersonChoices] = useState<Record<string, Decision>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const action = useAction();

  const pick = (file: File) =>
    action.run(async () => {
      setPreview(null);
      setResult(null);
      setFileName(file.name);
      const read = await readFileCells(file).catch(() => {
        throw new Error("Grid couldn't read that file. Use a CSV or Excel file.");
      });
      const planned = await api<Preview>("/clients/import/preview", { body: { cells: read } });
      setCells(read);
      setPreview(planned);
      setBusinessChoices(Object.fromEntries(planned.businesses.map((business) => [business.key, business.suggested])));
      setPersonChoices(Object.fromEntries(planned.people.map((person) => [person.key, person.suggested])));
    });

  const businessByKey = useMemo(() => new Map(preview?.businesses.map((business) => [business.key, business]) ?? []), [preview]);
  const leftOutBusinesses = new Set(preview?.businesses.filter((business) => !business.match && businessChoices[business.key] === "skip").map((business) => business.key));

  const setAllMatches = (decision: Decision) => {
    if (!preview) return;
    setBusinessChoices((current) => ({ ...current, ...Object.fromEntries(preview.businesses.filter(isMatchWithChanges).map((business) => [business.key, decision])) }));
    setPersonChoices((current) => ({ ...current, ...Object.fromEntries(preview.people.filter(isMatchWithChanges).map((person) => [person.key, decision])) }));
  };

  // What saving would do, for the button and the summary.
  const counts = useMemo(() => {
    const tally = { add: 0, update: 0 };
    if (!preview) return tally;
    for (const business of preview.businesses) {
      const choice = businessChoices[business.key];
      if (!business.match ? choice !== "skip" : choice === "add") tally.add++;
      else if (choice === "update" && isMatchWithChanges(business)) tally.update++;
    }
    for (const person of preview.people) {
      if (person.businessKey && leftOutBusinesses.has(person.businessKey)) continue;
      const choice = personChoices[person.key];
      if (!person.match ? choice !== "skip" : choice === "add") tally.add++;
      else if (choice === "update" && isMatchWithChanges(person)) tally.update++;
    }
    return tally;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, businessChoices, personChoices]);

  const save = () =>
    action.run(async () => {
      if (!cells) return;
      const saved = await api<ImportResult>("/clients/import", { body: { cells, decisions: { businesses: businessChoices, people: personChoices } } });
      setResult(saved);
      setPreview(null);
    });

  if (result) {
    const lines = [
      result.businessesAdded && `${plural(result.businessesAdded, "business", "businesses")} added`,
      result.businessesUpdated && `${plural(result.businessesUpdated, "business", "businesses")} updated`,
      result.peopleAdded && `${plural(result.peopleAdded, "person", "people")} added`,
      result.peopleUpdated && `${plural(result.peopleUpdated, "person", "people")} updated`,
    ].filter(Boolean);
    return (
      <>
        <PageHeader title="Import clients" />
        <Section title="Done">
          <Stack>
            <p>{lines.length ? `${lines.join(", ")}.` : "Nothing needed changing."}</p>
            {result.peopleLeftOut > 0 && <p className="text-sm text-muted-foreground">{plural(result.peopleLeftOut, "person was", "people were")} left out with the businesses you skipped.</p>}
            <FormActions>
              <Button variant="outline" onClick={() => (setResult(null), setFileName(null), setCells(null))}>
                Import another file
              </Button>
              <a href="/clients" className={buttonVariants()}>
                Back to Clients
              </a>
            </FormActions>
          </Stack>
        </Section>
      </>
    );
  }

  const matchesWithChanges = preview ? [...preview.businesses, ...preview.people].filter(isMatchWithChanges).length : 0;

  return (
    <>
      <PageHeader title="Import clients" subtitle="From a Grid export, another business's card, or other software." />
      <Stack>
        <Section title="Pick a file">
          <Stack>
            <p className="text-sm text-muted-foreground">
              A CSV or Excel file (the first sheet). The first row needs headings: Business, Name, Phone, Email and so on. Grid shows what it would do before anything is saved.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className={cn(buttonVariants(), "w-full cursor-pointer sm:w-auto", action.busy && "pointer-events-none opacity-50")}>
                <FileSpreadsheet /> {fileName ? "Pick another file" : "Pick a file"}
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.ods,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void pick(file);
                  }}
                />
              </label>
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => void downloadBlank()}>
                <Download /> Empty file to fill in
              </Button>
            </div>
            {fileName && <p className="truncate text-sm">{action.busy && !preview ? `Reading ${fileName}…` : fileName}</p>}
            {action.error && <Alert variant="error">{action.error}</Alert>}
          </Stack>
        </Section>

        {preview && (
          <>
            <Section title="What it would do" description={`Columns found: ${preview.columnsFound.join(", ")}`}>
              <Stack>
                <p>
                  {counts.add || counts.update
                    ? [counts.add && `Add ${counts.add}`, counts.update && `update ${counts.update}`].filter(Boolean).join(", ") + "."
                    : "Nothing to add or change."}{" "}
                  {matchesWithChanges > 0 && <span className="text-muted-foreground">{plural(matchesWithChanges, "match has", "matches have")} something different: choose what to do with each below.</span>}
                </p>
                {matchesWithChanges > 0 && preview.canUpdate && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setAllMatches("update")}>
                      Update all
                    </Button>
                    <Button variant="outline" onClick={() => setAllMatches("skip")}>
                      Skip all
                    </Button>
                  </div>
                )}
                {!preview.canUpdate && matchesWithChanges > 0 && <p className="text-sm text-muted-foreground">You can add clients but not change them, so matches are skipped.</p>}
              </Stack>
            </Section>

            {preview.businesses.length > 0 && (
              <Section title={`Businesses (${preview.businesses.length})`} flush>
                <List>
                  {preview.businesses.map((business) => (
                    <PlanRow
                      key={business.key}
                      title={business.fields.name}
                      meta={[business.fields.abn && `ABN ${business.fields.abn}`, business.fields.phone, business.fields.email].filter(Boolean).join(" · ")}
                      planned={business}
                      matchText={business.match ? `Already on the list${business.match.by === "abn" ? " (same ABN)" : ""}${business.match.name !== business.fields.name ? ` as ${business.match.name}` : ""}` : null}
                      choice={businessChoices[business.key] ?? business.suggested}
                      onChoice={(decision) => setBusinessChoices((current) => ({ ...current, [business.key]: decision }))}
                      canUpdate={preview.canUpdate}
                    />
                  ))}
                </List>
              </Section>
            )}

            {preview.people.length > 0 && (
              <Section title={`People (${preview.people.length})`} flush>
                <List>
                  {preview.people.map((person) => {
                    const business = person.businessKey ? businessByKey.get(person.businessKey) : null;
                    const leftOut = !!person.businessKey && leftOutBusinesses.has(person.businessKey);
                    return (
                      <PlanRow
                        key={person.key}
                        title={person.fields.name}
                        meta={[person.fields.role, business?.fields.name, person.fields.email, person.fields.phone].filter(Boolean).join(" · ")}
                        planned={person}
                        matchText={
                          person.match
                            ? `Already on the list${person.match.by === "email" ? " (same email)" : ""}${person.match.name !== person.fields.name ? ` as ${person.match.name}` : ""}${person.movesBusiness ? `. Update moves them to ${business?.fields.name ?? "this business"}.` : ""}`
                            : null
                        }
                        choice={personChoices[person.key] ?? person.suggested}
                        onChoice={(decision) => setPersonChoices((current) => ({ ...current, [person.key]: decision }))}
                        canUpdate={preview.canUpdate}
                        leftOut={leftOut ? `Left out: ${business?.fields.name ?? "their business"} is skipped.` : null}
                      />
                    );
                  })}
                </List>
              </Section>
            )}

            {preview.skipped.length > 0 && (
              <Section title={`Rows skipped (${preview.skipped.length})`} description="Fix these in the file and import it again if you want them." flush>
                <List>
                  {preview.skipped.map((row) => (
                    <li key={row.line} className="flex gap-3 px-4 py-2.5 text-sm sm:px-5">
                      <span className="shrink-0 font-medium tabular-nums">Row {row.line}</span>
                      <span className="min-w-0 text-muted-foreground">{row.reason}</span>
                    </li>
                  ))}
                </List>
              </Section>
            )}

            {preview.businesses.length === 0 && preview.people.length === 0 && (
              <Section>
                <EmptyState title="Nothing to import">No rows in that file have a name or a business.</EmptyState>
              </Section>
            )}

            <FormActions>
              <a href="/clients" className={buttonVariants({ variant: "outline" })}>
                Cancel
              </a>
              <Button disabled={action.busy || (!counts.add && !counts.update)} onClick={() => void save()}>
                <ArrowDownUp /> {action.busy ? "Saving…" : `Import${counts.add || counts.update ? ` (${counts.add + counts.update})` : ""}`}
              </Button>
            </FormActions>
          </>
        )}
      </Stack>
    </>
  );
}

function ChangeList({ changes }: { changes: FieldChange[] }) {
  return (
    <ul className="mt-1.5 flex flex-col gap-0.5 text-sm">
      {changes.map((change) => (
        <li key={change.field} className="break-words">
          <span className="font-medium">{change.label}:</span> <span className="text-muted-foreground line-through">{change.from || "empty"}</span> → {change.to}
        </li>
      ))}
    </ul>
  );
}

function PlanRow({
  title,
  meta,
  planned,
  matchText,
  choice,
  onChoice,
  canUpdate,
  leftOut = null,
}: {
  title: string;
  meta: string;
  planned: PlannedBusiness | PlannedPerson;
  matchText: string | null;
  choice: Decision;
  onChoice: (decision: Decision) => void;
  canUpdate: boolean;
  leftOut?: string | null;
}) {
  const withChanges = isMatchWithChanges(planned);
  const options: { value: Decision; label: string }[] = !planned.match
    ? [
        { value: "add", label: "Add" },
        { value: "skip", label: "Skip" },
      ]
    : [{ value: "skip", label: "Skip" }, ...(canUpdate ? [{ value: "update" as const, label: "Update" }] : []), { value: "add", label: "Add as new" }];
  const badge = leftOut ? (
    <Badge variant="outline">Left out</Badge>
  ) : !planned.match ? (
    <Badge variant="success">New</Badge>
  ) : withChanges ? (
    <Badge variant="warning">Different</Badge>
  ) : (
    <Badge variant="outline">Same</Badge>
  );

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:px-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          {meta && <p className="truncate text-sm text-muted-foreground">{meta}</p>}
          {matchText && <p className="text-sm text-muted-foreground">{matchText}</p>}
          {leftOut && <p className="text-sm text-muted-foreground">{leftOut}</p>}
          {withChanges && planned.changes.length > 0 && <ChangeList changes={planned.changes} />}
        </div>
        <span className="shrink-0">{badge}</span>
      </div>
      {/* A match with nothing different needs nothing. */}
      {!leftOut && (!planned.match || withChanges) && <Segmented<Decision> label={`What to do with ${title}`} value={choice} onChange={onChoice} items={options} />}
    </li>
  );
}
