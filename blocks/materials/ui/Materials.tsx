"use client";

// Settings › Materials: the things the business installs (docs/materials-block.md §1).
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ActionButton, EmptyState, List, PageHeader, Scroller, SearchInput, Section, Stack, api, cn } from "@grid/ui";
import { MATERIAL_TRADES, tradeName } from "../trades";
import { materialMeta } from "../words";
import { BrandChips, BrandsSheet, type BrandFilter } from "./Brands";
import { MaterialSheet } from "./MaterialSheet";
import { MaterialPicture, type BrandJson, type MaterialJson } from "./shared";

export function Materials({ initial, initialBrands, canManage }: { initial: MaterialJson[]; initialBrands: BrandJson[]; canManage: boolean }) {
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState("");
  const [brands, setBrands] = useState(initialBrands);
  const [brand, setBrand] = useState<BrandFilter>("ALL");
  const [trade, setTrade] = useState("ALL");
  const [adding, setAdding] = useState<Partial<MaterialJson> | null>(null);
  const [managingBrands, setManagingBrands] = useState(false);

  const load = async () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (brand !== "ALL") params.set("brand", brand);
    setRows(await api<MaterialJson[]>(`/materials?${params}`));
  };
  const loadBrands = async () => {
    const next = await api<BrandJson[]>("/materials/brands");
    setBrands(next);
    if (brand !== "ALL" && brand !== "none" && !next.some((entry) => entry.id === brand)) setBrand("ALL");
  };
  useEffect(() => {
    const timer = setTimeout(() => void load().catch(() => {}), 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, brand]);

  // Only the trades that have materials get a chip.
  const trades = useMemo(() => MATERIAL_TRADES.filter((entry) => rows.some((row) => row.trade === entry.id)), [rows]);
  const shown = trade === "ALL" ? rows : rows.filter((row) => row.trade === trade);
  const filtered = !!query || brand !== "ALL" || trade !== "ALL";

  return (
    <>
      <PageHeader
        title="Materials"
        subtitle="The things you install, kept once with their photo, brand and finish. The price book adds your prices; handover sheets list them per room."
        meta={`${rows.length} ${rows.length === 1 ? "material" : "materials"}`}
        actions={canManage && <ActionButton icon={<Plus />} label="Add material" onClick={() => setAdding({ name: query.trim() })} />}
      />
      <Stack>
        <SearchInput label="Search materials" placeholder="Name, type, brand, model or finish" value={query} onChange={(event) => setQuery(event.target.value)} />
        {trades.length > 1 && (
          <Scroller axis="x" className="flex gap-2" role="group" aria-label="Filter by trade">
            {[{ id: "ALL", name: "All trades" }, ...trades].map((chip) => (
              <button
                key={chip.id}
                type="button"
                aria-pressed={chip.id === trade}
                onClick={() => setTrade(chip.id)}
                className={cn(
                  "flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors",
                  chip.id === trade ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {chip.name}
              </button>
            ))}
          </Scroller>
        )}
        <BrandChips brands={brands} value={brand} onChange={setBrand} onManage={canManage ? () => setManagingBrands(true) : undefined} />
        <Section flush>
          {shown.length === 0 ? (
            <EmptyState title={filtered ? "Nothing matches" : "No materials yet"}>
              {!filtered && canManage && "Add the things you install most: a photo, the brand, the model and the finish. Quotes and handover sheets pick from this list."}
            </EmptyState>
          ) : (
            <List>
              {shown.map((row) => (
                <li key={row.id}>
                  <a href={`/materials/${row.id}`} className="flex min-h-touch-lg items-center gap-3 px-4 py-2.5 hover:bg-muted active:bg-muted sm:px-5">
                    <MaterialPicture material={row} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{row.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {[row.itemType, materialMeta(row), trades.length > 1 ? tradeName(row.trade) : null].filter(Boolean).join(" · ") || "No details yet"}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </List>
          )}
        </Section>
      </Stack>
      {adding && (
        <MaterialSheet
          material={adding}
          onClose={() => setAdding(null)}
          onSaved={(saved) => {
            setAdding(null);
            window.location.href = `/materials/${saved.id}`;
          }}
          onOpen={(existing) => (window.location.href = `/materials/${existing.id}`)}
        />
      )}
      {managingBrands && <BrandsSheet brands={brands} onChanged={async () => void (await Promise.all([loadBrands(), load()]))} onClose={() => setManagingBrands(false)} />}
    </>
  );
}
