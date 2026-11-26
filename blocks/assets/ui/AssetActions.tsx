"use client";

// The buttons on an asset's page: Change, Print tag, New tag (the old
// sticker stops working), Retire or Put back in service, Delete (only for
// one added by mistake: gear that was used is retired, keeping its history).
import { useState } from "react";
import { Archive, MoreHorizontal, Pencil, Printer, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { ActionButton, Alert, Button, Sheet, SheetContent, api, useAction } from "@grid/ui";
import { AssetSheet } from "./AssetSheet";
import { PrintTagsSheet } from "./PrintTagsSheet";
import type { AssetJson, CategoryJson } from "./shared";

export function AssetActions({ asset, categories }: { asset: AssetJson; categories: CategoryJson[] }) {
  const [open, setOpen] = useState<"edit" | "print" | "more" | null>(null);
  const action = useAction();
  const reload = () => window.location.reload();
  const retired = asset.status === "RETIRED";

  return (
    <>
      <ActionButton variant="outline" icon={<Printer />} label="Print tag" onClick={() => setOpen("print")} />
      <ActionButton variant="outline" icon={<Pencil />} label="Change" onClick={() => setOpen("edit")} />
      <ActionButton variant="ghost" icon={<MoreHorizontal />} label="More" onClick={() => setOpen("more")} />
      {open === "edit" && <AssetSheet asset={asset} categories={categories} onClose={() => setOpen(null)} onSaved={reload} />}
      {open === "print" && <PrintTagsSheet assetIds={[asset.id]} onClose={() => setOpen(null)} />}
      {open === "more" && (
        <Sheet open onOpenChange={(next) => !next && setOpen(null)}>
          <SheetContent desktop="dialog" title={`Asset No. ${asset.number}`}>
            <div className="flex flex-col gap-2 px-2">
              <Button
                variant="outline"
                disabled={action.busy}
                onClick={() => {
                  if (!window.confirm("Make a new tag? The old sticker stops working straight away, so print and stick on the new one.")) return;
                  void action.run(async () => (await api(`/assets/${asset.id}/new-tag`, { method: "POST" }), reload()));
                }}
              >
                <RefreshCw /> New tag (sticker lost or damaged)
              </Button>
              <Button
                variant="outline"
                disabled={action.busy || !(asset.status === "IN_SERVICE" || retired)}
                onClick={() => void action.run(async () => (await api(`/assets/${asset.id}/status`, { method: "PUT", body: { status: retired ? "IN_SERVICE" : "RETIRED" } }), reload()))}
              >
                {retired ? <RotateCcw /> : <Archive />} {retired ? "Put back in service" : "Retire"}
              </Button>
              {!retired && <p className="px-1 text-sm text-muted-foreground">Retire gear you no longer use: it leaves the list but keeps its history, and its tag still opens it.</p>}
              <Button
                variant="ghost"
                className="text-destructive"
                disabled={action.busy}
                onClick={() => {
                  if (!window.confirm(`Delete Asset No. ${asset.number}, ${asset.name}? Its photos go and its tag stops working. Only for something added by mistake: retire gear you've used.`)) return;
                  void action.run(async () => (await api(`/assets/${asset.id}`, { method: "DELETE" }), (window.location.href = "/assets")));
                }}
              >
                <Trash2 /> Delete
              </Button>
              <Alert variant="error">{action.error}</Alert>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
