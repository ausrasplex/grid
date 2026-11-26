"use client";

// The assets list (/assets, docs/assets-block.md §1): search by name,
// number, make, model, serial or barcode, or scan a tag; category chips;
// retired gear on its own tab. Select to print tags for several at once.
import { useEffect, useMemo, useState } from "react";
import { CheckSquare, Plus, Printer, ScanLine } from "lucide-react";
import { ActionButton, Button, Checkbox, EmptyState, List, PageHeader, Scroller, SearchInput, Section, Segmented, Stack, api, buttonVariants, cn } from "@grid/ui";
import { AssetSheet } from "./AssetSheet";
import { PrintTagsSheet } from "./PrintTagsSheet";
import { AssetPicture, StatusBadge, assetMeta, type AssetJson, type CategoryJson } from "./shared";

type Show = "active" | "retired";

export function Assets({ initial, categories, canManage }: { initial: AssetJson[]; categories: CategoryJson[]; canManage: boolean }) {
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [show, setShow] = useState<Show>("active");
  const [adding, setAdding] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);
  const [first, setFirst] = useState(true);

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
        subtitle="Your tools and gear, each with a QR tag. Scan a tag to open it."
        meta={`${rows.length} ${rows.length === 1 ? "asset" : "assets"}${show === "retired" ? " retired" : ""}`}
        actions={
          canManage && (
            <>
              {rows.length > 0 && <ActionButton variant="outline" icon={<CheckSquare />} label={selecting ? "Done" : "Select"} onClick={() => (setSelecting(!selecting), setPicked(new Set()))} />}
              <ActionButton icon={<Plus />} label="Add asset" onClick={() => setAdding(true)} />
            </>
          )
        }
      />
      <Stack>
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
                    "flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors",
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
        <Section flush>
          {rows.length === 0 ? (
            <EmptyState title={filtered ? "Nothing matches" : show === "retired" ? "Nothing retired" : "No assets yet"}>
              {!filtered && show === "active" && canManage && "Add your tools and gear: a photo, the make and model, the serial number. Then print QR tags to stick on them."}
            </EmptyState>
          ) : (
            <List>
              {rows.map((row) => {
                const body = (
                  <>
                    <AssetPicture asset={row} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{row.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">{[`No. ${row.number}`, assetMeta(row, used.length > 1 || category === "ALL")].filter(Boolean).join(" · ")}</span>
                    </span>
                    <StatusBadge status={row.status} />
                  </>
                );
                return (
                  <li key={row.id}>
                    {selecting ? (
                      <label className="flex min-h-touch-lg cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted sm:px-5">
                        <Checkbox checked={picked.has(row.id)} onCheckedChange={() => toggle(row.id)} aria-label={`Asset No. ${row.number}`} />
                        {body}
                      </label>
                    ) : (
                      <a href={`/assets/${row.id}`} className="flex min-h-touch-lg items-center gap-3 px-4 py-2.5 hover:bg-muted active:bg-muted sm:px-5">
                        {body}
                      </a>
                    )}
                  </li>
                );
              })}
            </List>
          )}
        </Section>
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
