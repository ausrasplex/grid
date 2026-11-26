"use client";

// The ⋯ menu beside an asset's name (Docket's item menu): Edit asset, Add
// kit piece, Duplicate, Print tag, New tag (the old sticker stops
// working), then Retire or Put back in service, and Delete (only for one
// added by mistake: gear that was used is retired, keeping its history).
import { useState } from "react";
import { Archive, Check, Copy, MoreHorizontal, Pencil, Plus, Printer, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { Alert, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Field, Sheet, SheetContent, api, cn, useAction } from "@grid/ui";
import { AssetSheet } from "./AssetSheet";
import { PartSheet } from "./KitCard";
import { PrintTagsSheet } from "./PrintTagsSheet";
import type { AssetJson, CategoryJson } from "./shared";

export function AssetMenu({ asset, categories, parts }: { asset: AssetJson; categories: CategoryJson[]; parts: { id: string; name: string }[] }) {
  const [open, setOpen] = useState<"edit" | "print" | "duplicate" | "piece" | null>(null);
  const action = useAction();
  const reload = () => window.location.reload();
  const retired = asset.status === "RETIRED";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Asset options" className="shrink-0 bg-card">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          <DropdownMenuItem onSelect={() => setOpen("edit")}>
            <Pencil /> Edit asset
          </DropdownMenuItem>
          {(asset.partsEnabled || parts.length > 0) && (
            <DropdownMenuItem onSelect={() => setOpen("piece")}>
              <Plus /> Add kit piece
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setOpen("duplicate")}>
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen("print")}>
            <Printer /> Print tag
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              if (!window.confirm("Make a new tag? The old sticker stops working straight away, so print and stick on the new one.")) return;
              void action.run(async () => (await api(`/assets/${asset.id}/new-tag`, { method: "POST" }), reload()));
            }}
          >
            <RefreshCw /> New tag
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!(asset.status === "IN_SERVICE" || asset.status === "OVERDUE" || retired)}
            onSelect={() => {
              if (!retired && !window.confirm(`Retire ${asset.name}? It leaves the list but keeps its history, and its tag still opens it.`)) return;
              void action.run(async () => (await api(`/assets/${asset.id}/status`, { method: "PUT", body: { status: retired ? "IN_SERVICE" : "RETIRED" } }), reload()));
            }}
          >
            {retired ? <RotateCcw /> : <Archive />} {retired ? "Put back in service" : "Retire asset"}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              if (!window.confirm(`Delete Asset No. ${asset.number}, ${asset.name}? Its photos and documents go and its tag stops working. Only for something added by mistake: retire gear you've used.`)) return;
              void action.run(async () => (await api(`/assets/${asset.id}`, { method: "DELETE" }), (window.location.href = "/assets")));
            }}
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {action.error && (
        <div className="fixed inset-x-4 bottom-24 z-50 sm:left-auto sm:w-96">
          <Alert variant="error">{action.error}</Alert>
        </div>
      )}
      {open === "edit" && <AssetSheet asset={asset} categories={categories} onClose={() => setOpen(null)} onSaved={reload} />}
      {open === "print" && <PrintTagsSheet assetIds={[asset.id]} onClose={() => setOpen(null)} />}
      {open === "piece" && <PartSheet assetId={asset.id} part={null} defaults={{ make: asset.make ?? "" }} onClose={() => setOpen(null)} />}
      {open === "duplicate" && <DuplicateSheet asset={asset} parts={parts} onClose={() => setOpen(null)} />}
    </>
  );
}

type CopyInput = { serial: string; partSerials: Record<string, string> };

/**
 * Duplicate (Docket's): the same model again, one card per copy with its
 * own serials. Each copy gets the next number and its own QR tag; details,
 * kit pieces and its own routines are copied; manuals, warranties and
 * links are shared with this one.
 */
function DuplicateSheet({ asset, parts, onClose }: { asset: AssetJson; parts: { id: string; name: string }[]; onClose: () => void }) {
  const [copies, setCopies] = useState<CopyInput[]>([{ serial: "", partSerials: {} }]);
  const [made, setMade] = useState<{ ids: string[]; numbers: number[] } | null>(null);
  const [printing, setPrinting] = useState(false);
  const action = useAction();
  const change = (index: number, changes: Partial<CopyInput>) => setCopies(copies.map((copy, at) => (at === index ? { ...copy, ...changes } : copy)));
  const count = copies.length;

  if (printing && made) return <PrintTagsSheet assetIds={made.ids} onClose={() => window.location.reload()} />;

  return (
    <Sheet open onOpenChange={(open) => !open && (made ? window.location.reload() : onClose())}>
      <SheetContent
        title={made ? "Copies made" : "Duplicate asset"}
        description={
          made
            ? undefined
            : `More of the same ${asset.name}? Each copy gets the next number, its own QR tag and serials. The details, kit pieces and routines are copied, and manuals, warranties and links are shared with this one.`
        }
        footer={
          made ? (
            <>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Done
              </Button>
              <Button onClick={() => setPrinting(true)}>
                <Printer /> Print their tags
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={action.busy}>
                Cancel
              </Button>
              <Button
                disabled={action.busy || !count}
                onClick={() =>
                  void action.run(async () =>
                    setMade(await api<{ ids: string[]; numbers: number[] }>(`/assets/${asset.id}/duplicate`, { body: { copies: copies.map((copy) => ({ serial: copy.serial || null, partSerials: copy.partSerials })) } })),
                  )
                }
              >
                {action.busy ? "Copying…" : count > 1 ? `Make ${count} copies` : "Make copy"}
              </Button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-3 px-2">
          {made ? (
            <ul className="flex flex-col gap-2">
              {made.ids.map((id, index) => (
                <li key={id}>
                  <a href={`/assets/${id}`} className="flex min-h-touch-lg items-center gap-3 rounded-xl bg-muted px-3.5 py-2 font-semibold hover:bg-accent">
                    <Check className="size-5 text-success" />
                    Asset No. {made.numbers[index]}, {asset.name}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <>
              {copies.map((copy, index) => (
                <div key={index} className={cn("flex flex-col gap-2.5 rounded-xl border-2 border-primary bg-muted p-3.5")}>
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-sm">Copy {index + 1}</b>
                    {count > 1 && (
                      <Button variant="ghost" size="icon" aria-label={`Take off copy ${index + 1}`} onClick={() => setCopies(copies.filter((_, at) => at !== index))}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                  <Field label="Serial" placeholder="Optional" autoComplete="off" value={copy.serial} onChange={(event) => change(index, { serial: event.target.value })} autoFocus={index === copies.length - 1} />
                  {parts.map((part) => (
                    <Field
                      key={part.id}
                      label={`${part.name} serial`}
                      placeholder="Optional"
                      autoComplete="off"
                      value={copy.partSerials[part.id] ?? ""}
                      onChange={(event) => change(index, { partSerials: { ...copy.partSerials, [part.id]: event.target.value } })}
                    />
                  ))}
                </div>
              ))}
              <Button variant="outline" className="self-start" onClick={() => setCopies([...copies, { serial: "", partSerials: {} }])}>
                <Plus /> Another copy
              </Button>
              <Alert variant="error">{action.error}</Alert>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
