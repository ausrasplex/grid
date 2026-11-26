"use client";

// The assets list (/assets, docs/assets-block.md §1, "What part 4b
// built"), laid out like Docket's Fixtures: cards grouped by where the
// gear is (with you, the workshop and each van, each job, with other
// people), each card with its picture, name, number and make, and chips
// for what needs a look: Do not use, a test due, the warranty, kit
// pieces, documents. Search, scan, category chips and In use / With me /
// Due / Retired above. Asset register and Select → Print tags in the header.
import { useEffect, useMemo, useState } from "react";
import { CheckSquare, ChevronRight, FileText, Plus, Printer, Puzzle, ScanLine, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { ActionButton, Alert, Button, Checkbox, EmptyState, PageHeader, Scroller, SearchInput, Segmented, Stack, api, buttonVariants, cn, useAction } from "@grid/ui";
import { AssetSheet } from "./AssetSheet";
import { CategoryTile } from "./CategoryTile";
import { PrintTagsSheet, download } from "./PrintTagsSheet";
import { Chip, WARRANTY_TONE, statusWords, type AssetJson, type CategoryJson, type WarrantyJson } from "./shared";

type Show = "active" | "mine" | "due" | "retired";

interface Group {
  key: string;
  name: string;
  rows: AssetJson[];
  /** Other people's gear: each card says who has it. */
  people?: boolean;
}

/** With you first; then the workshop and vans (A–Z); then each job; then gear with other people. */
function groupByPlace(rows: AssetJson[], userId: string): Group[] {
  const mine: AssetJson[] = [];
  const people: AssetJson[] = [];
  const places = new Map<string, AssetJson[]>();
  const jobs = new Map<string, AssetJson[]>();
  for (const row of rows) {
    const holder = row.holder;
    if (holder.kind === "USER") (holder.userId === userId ? mine : people).push(row);
    else if (holder.kind === "PROJECT") {
      const name = (holder.place ?? holder.text).split(" · ")[0]!;
      jobs.set(name, [...(jobs.get(name) ?? []), row]);
    } else {
      const name = holder.place ?? holder.text;
      places.set(name, [...(places.get(name) ?? []), row]);
    }
  }
  const sorted = (map: Map<string, AssetJson[]>, prefix: string) =>
    [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, list]) => ({ key: `${prefix}:${name}`, name, rows: list }));
  return [
    { key: "mine", name: "With you", rows: mine },
    ...sorted(places, "place"),
    ...sorted(jobs, "job"),
    { key: "people", name: "With other people", rows: people, people: true },
  ].filter((group) => group.rows.length);
}

function WarrantyIcon({ tone }: { tone: WarrantyJson["tone"] }) {
  const Icon = tone === "expired" ? ShieldX : tone === "soon" ? ShieldAlert : ShieldCheck;
  return <Icon aria-hidden />;
}

/** Do not use, Lost, Overdue and the like as a chip; nothing for gear in service. */
function StatusChip({ status }: { status: AssetJson["status"] }) {
  if (status === "IN_SERVICE") return null;
  const urgent = status === "OUT_OF_SERVICE" || status === "LOST" || status === "OVERDUE" || status === "FAULTY";
  return <Chip tone={urgent ? "overdue" : "none"}>{statusWords(status)}</Chip>;
}

function AssetCard({ row, withWho, selecting, picked, onToggle }: { row: AssetJson; withWho: boolean; selecting: boolean; picked: boolean; onToggle: () => void }) {
  const makeModel = [row.make, row.model].filter(Boolean).join(" ");
  const sub = [`No. ${row.number}`, makeModel || row.category, withWho ? row.holder.userName : null].filter(Boolean).join(" · ");
  const body = (
    <>
      <div className="flex items-center gap-3">
        {selecting && <Checkbox checked={picked} onCheckedChange={onToggle} aria-label={`Asset No. ${row.number}`} />}
        <CategoryTile icon={row.categoryIcon} photoFileId={row.photoFileIds[0]} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-bold">{row.name}</span>
          <span className="truncate text-xs font-medium text-muted-foreground">{sub}</span>
        </span>
        {!selecting && <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />}
      </div>
      {(row.status !== "IN_SERVICE" || row.due || row.warranty.tone !== "none" || row.partCount > 0 || row.documentCount > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip status={row.status} />
          {row.due && row.status !== "OVERDUE" && <Chip tone={row.due.tone}>{row.due.text}</Chip>}
          {row.warranty.tone !== "none" && (
            <Chip tone={WARRANTY_TONE[row.warranty.tone]} title={row.warranty.text}>
              <WarrantyIcon tone={row.warranty.tone} />
              {row.warranty.date}
              <span className="sr-only">{row.warranty.text}</span>
            </Chip>
          )}
          {row.partCount > 0 && (
            <Chip title={`${row.partCount} kit piece${row.partCount === 1 ? "" : "s"}`}>
              <Puzzle aria-hidden />
              {row.partCount}
              <span className="sr-only"> kit {row.partCount === 1 ? "piece" : "pieces"}</span>
            </Chip>
          )}
          {row.documentCount > 0 && (
            <Chip title={`${row.documentCount} manual${row.documentCount === 1 ? "" : "s"} and documents`}>
              <FileText aria-hidden />
              {row.documentCount}
              <span className="sr-only"> documents</span>
            </Chip>
          )}
        </div>
      )}
    </>
  );
  const card = "group flex flex-col gap-3 rounded-xl bg-card p-4 transition-colors hover:bg-muted/60";
  return selecting ? (
    <label className={cn(card, "cursor-pointer", picked && "ring-2 ring-primary")}>{body}</label>
  ) : (
    <a href={`/assets/${row.id}`} className={card}>
      {body}
    </a>
  );
}

export function Assets({ initial, categories, canManage, userId }: { initial: AssetJson[]; categories: CategoryJson[]; canManage: boolean; userId: string }) {
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [show, setShow] = useState<Show>("active");
  const [adding, setAdding] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [first, setFirst] = useState(true);
  const register = useAction();

  // Home's "overdue for a test" opens this with ?show=due; Add asset in a menu with ?add=1.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("show") === "due") setShow("due");
    if (params.get("add") === "1" && canManage) setAdding(true);
  }, [canManage]);

  useEffect(() => {
    // The page arrives with the active list; fetch only once something changes.
    if (first) return setFirst(false);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ show });
      if (query.trim()) params.set("q", query.trim());
      if (category !== "ALL") params.set("category", category);
      void api<AssetJson[]>(`/assets?${params}`)
        .then(setRows)
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, show]);

  const used = useMemo(() => categories.filter((entry) => entry.count > 0), [categories]);
  const filtered = !!query || category !== "ALL";
  // Due is most urgent first, so it isn't grouped; everything else is grouped by where it is.
  const groups: Group[] = show === "due" ? [{ key: "due", name: "Due in the next 30 days", rows }] : groupByPlace(rows, userId);
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader
        title="Assets"
        meta={`${rows.length} ${rows.length === 1 ? "asset" : "assets"}${show === "retired" ? " retired" : show === "mine" ? " with you" : show === "due" ? " due" : ""}`}
        actions={
          canManage && (
            <>
              <ActionButton
                variant="outline"
                icon={<ShieldCheck />}
                label={register.busy ? "Making…" : "Asset register"}
                title="Asset register: everything in service with its serial and value, for insurance and the accountant"
                disabled={register.busy}
                onClick={() => void register.run(() => download("/api/assets/register.pdf", `Asset register ${new Date().toISOString().slice(0, 10)}.pdf`))}
              />
              {rows.length > 0 && <ActionButton variant="outline" icon={<CheckSquare />} label={selecting ? "Done" : "Select"} onClick={() => (setSelecting(!selecting), setPicked(new Set()))} />}
              <ActionButton icon={<Plus />} label="Add asset" onClick={() => setAdding(true)} />
            </>
          )
        }
      />
      <Stack>
        <Alert variant="error">{register.error}</Alert>
        <div className="flex gap-2">
          <SearchInput className="flex-1" label="Search assets" placeholder="Name, number, make, model, serial" value={query} onChange={(event) => setQuery(event.target.value)} />
          <a href="/scan?for=assets" className={cn(buttonVariants({ variant: "outline" }), "size-touch shrink-0 px-0")} aria-label="Scan a tag" title="Scan a tag">
            <ScanLine />
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {used.length > 0 && (
            <Scroller axis="x" className="flex min-w-0 flex-1 gap-2" role="group" aria-label="Filter by category">
              {[{ id: "ALL", name: "All" }, ...used, { id: "none", name: "No category" }].map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={chip.id === category}
                  onClick={() => setCategory(chip.id)}
                  className={cn(
                    "flex h-touch shrink-0 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors",
                    chip.id === category ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {chip.name}
                </button>
              ))}
            </Scroller>
          )}
          <Segmented
            label="Show"
            value={show}
            onChange={setShow}
            items={[
              { value: "active", label: "In use" },
              { value: "mine", label: "With me" },
              { value: "due", label: "Due" },
              { value: "retired", label: "Retired" },
            ]}
          />
        </div>
        {selecting && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-card p-3">
            <span className="flex-1 text-sm font-semibold">{picked.size ? `${picked.size} picked` : "Tick the assets to print tags for"}</span>
            <Button variant="ghost" onClick={() => setPicked(picked.size === rows.length ? new Set() : new Set(rows.map((row) => row.id)))}>
              {picked.size === rows.length ? "None" : "All"}
            </Button>
            <Button disabled={!picked.size} onClick={() => setPrinting(true)}>
              <Printer /> Print tags
            </Button>
          </div>
        )}
        {rows.length === 0 ? (
          <div className="rounded-xl bg-card">
            <EmptyState title={filtered ? "Nothing matches" : show === "retired" ? "Nothing retired" : show === "mine" ? "You haven't got anything checked out" : show === "due" ? "Nothing due in the next 30 days" : "No assets yet"}>
              {!filtered && show === "active" && canManage && "Add your tools and gear: a photo, the make and model, the serial number. Each can have kit pieces (the batteries, charger and case), with their own serials and warranties. Then print QR tags to stick on them."}
            </EmptyState>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-3">
              <h2 className="text-lg font-bold">
                {group.name}
                <span className="ml-2 text-sm font-medium text-muted-foreground">{group.rows.length}</span>
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.rows.map((row) => (
                  <AssetCard key={row.id} row={row} withWho={!!group.people || show === "due"} selecting={selecting} picked={picked.has(row.id)} onToggle={() => toggle(row.id)} />
                ))}
              </div>
            </section>
          ))
        )}
      </Stack>
      {adding && (
        <AssetSheet
          asset={{ name: query.trim(), categoryId: category !== "ALL" && category !== "none" ? category : null }}
          categories={categories}
          onClose={() => setAdding(false)}
          onSaved={(saved) => (window.location.href = `/assets/${saved.id}`)}
        />
      )}
      {printing && <PrintTagsSheet assetIds={[...picked]} onClose={() => setPrinting(false)} />}
    </>
  );
}
