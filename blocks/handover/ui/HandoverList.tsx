"use client";

// A job's handover list (/handover/<job>, docs/materials-block.md §2):
// what's installed, by trade then room. Add a material to a room, tap a
// line to change its room, quantity or note, or swap it for another finish
// in its family. Bring in adds lines from plan icons and accepted quotes.
// The PDF, the sheet's switches and the client's link are at the top.

import { useState } from "react";
import { ArrowDownToLine, ArrowLeft, FileText, ListOrdered, Plus, SlidersHorizontal } from "lucide-react";
import { ActionButton, Alert, Button, EmptyState, List, PageHeader, Stack, TapRow, api, buttonVariants, cn } from "@grid/ui";
import { MaterialPicker, MaterialPicture, type MaterialJson } from "@grid/block-materials/components";
import { tradeName } from "@grid/block-materials/trades";
import { LineSheet } from "./LineSheet";
import { RoomsSheet } from "./RoomsSheet";
import { JobSettingsSheet } from "./JobSettingsSheet";
import { ShareCard } from "./ShareCard";
import { BringInSheet, sourcesLabel } from "./BringInSheet";
import { finishLine, type HandoverJson, type LineJson } from "./shared";

/** What's open: picking a material for a room, a new line, a line, the settings or the rooms. */
type Open =
  | { kind: "pick"; room: string | null }
  | { kind: "new"; material: MaterialJson; room: string | null }
  | { kind: "line"; line: LineJson }
  | { kind: "settings" }
  | { kind: "rooms" }
  | { kind: "bring" }
  | null;

const fromWords = (line: LineJson) => (line.source === "MANUAL" ? null : `From ${line.source === "PLANS" ? "plans" : "quote"}${line.editedByHand ? ", changed by hand" : ""}`);

export function HandoverList({
  initial,
  canEdit,
  canShare,
  canAddMaterials,
  bringIn,
}: {
  initial: HandoverJson;
  canEdit: boolean;
  canShare: boolean;
  canAddMaterials: boolean;
  /** What Bring in can use: plans (Markups on) and accepted quotes (Quotes on). */
  bringIn: ("PLANS" | "QUOTE")[];
}) {
  const [view, setView] = useState(initial);
  const [open, setOpen] = useState<Open>(null);
  const jobId = view.job.id;
  const reload = async () => setView(await api<HandoverJson>(`/handover/job/${jobId}`));
  const close = () => setOpen(null);
  const printed = (trade: string) => view.company.tradeNames[trade] || tradeName(trade);
  const lastRoom = view.lines.at(-1)?.room ?? null;
  const canBringIn = canEdit && bringIn.length > 0;
  const bringButton = canBringIn && (
    <Button variant="outline" onClick={() => setOpen({ kind: "bring" })} block>
      <ArrowDownToLine /> Bring in from {sourcesLabel(bringIn)}
    </Button>
  );

  return (
    <>
      <a href={`/jobs/${jobId}`} className="mb-2 inline-flex min-h-touch items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {view.job.name}
      </a>
      <PageHeader
        title="Handover"
        meta={[view.settings.title || view.company.title, view.lines.length ? `${view.lines.length} line${view.lines.length === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}
        actions={
          <>
            {canEdit && <ActionButton variant="outline" icon={<SlidersHorizontal />} label="Sheet settings" onClick={() => setOpen({ kind: "settings" })} />}
            <a href={`/handover/${jobId}/pdf`} className={cn(buttonVariants({ variant: "outline" }), "size-touch px-0 sm:w-auto sm:px-4")} aria-label="See the PDF" title="See the PDF">
              <FileText /> <span className="hidden sm:inline">PDF</span>
            </a>
          </>
        }
      />
      <Stack>
        {view.job.archived && <Alert>This job is archived. The client&apos;s link keeps working.</Alert>}
        {canShare && <ShareCard projectId={jobId} hasClient={!!view.job.clientId} />}

        {view.lines.length === 0 ? (
          <EmptyState title="Nothing on the list yet">
            <p>Add the things you installed, room by room: downlights, switches, power points, fans. Each comes from Materials with its photo, brand and finish.</p>
            {canEdit && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <Button onClick={() => setOpen({ kind: "pick", room: null })}>
                  <Plus /> Add a material
                </Button>
                {bringButton}
              </div>
            )}
          </EmptyState>
        ) : (
          <>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setOpen({ kind: "pick", room: lastRoom })} block>
                  <Plus /> Add a material
                </Button>
                {view.rooms.length > 0 && (
                  <Button variant="outline" onClick={() => setOpen({ kind: "rooms" })} block>
                    <ListOrdered /> Rooms
                  </Button>
                )}
                {bringButton}
              </div>
            )}
            {view.groups.map((group) => (
              <section key={group.trade} className="flex flex-col gap-3" aria-label={printed(group.trade)}>
                {view.groups.length > 1 && <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{printed(group.trade)}</h2>}
                {group.rooms.map((room) => (
                  <div key={room.room ?? ""} className="overflow-hidden rounded-xl bg-card">
                    <div className="flex min-h-touch items-center gap-2 border-b px-4 sm:px-5">
                      <h3 className="flex-1 font-bold tracking-wide uppercase">{room.room ?? "General"}</h3>
                      {canEdit && (
                        <Button variant="ghost" size="sm" onClick={() => setOpen({ kind: "pick", room: room.room })} aria-label={`Add to ${room.room ?? "General"}`}>
                          <Plus /> Add
                        </Button>
                      )}
                    </div>
                    <List>
                      {room.lines.map((line) => (
                        <TapRow
                          key={line.id}
                          leading={<MaterialPicture material={line.material} />}
                          title={[line.material.itemType, line.material.name].filter(Boolean).join(": ")}
                          meta={[finishLine(line.material), line.note, fromWords(line)].filter(Boolean).join(" · ") || undefined}
                          badges={
                            view.settings.showQty ? (
                              <span className={cn("ml-auto shrink-0 text-sm font-semibold", line.qty === null && "text-muted-foreground")}>{line.qty === null ? "TBC" : `× ${line.qty}`}</span>
                            ) : undefined
                          }
                          onClick={() => setOpen({ kind: "line", line })}
                        />
                      ))}
                    </List>
                  </div>
                ))}
              </section>
            ))}
          </>
        )}
      </Stack>

      {open?.kind === "pick" && (
        <MaterialPicker
          title={open.room ? `Add to ${open.room}` : "Add a material"}
          canAdd={canAddMaterials}
          onClose={close}
          onPick={(material) => setOpen({ kind: "new", material, room: open.room })}
        />
      )}
      {(open?.kind === "new" || open?.kind === "line") && (
        <LineSheet
          projectId={jobId}
          line={open.kind === "line" ? open.line : null}
          material={open.kind === "new" ? open.material : open.line.material}
          room={open.kind === "new" ? open.room : open.line.room}
          rooms={view.rooms}
          showQty={view.settings.showQty}
          canEdit={canEdit}
          onClose={close}
          onSaved={async () => (close(), await reload())}
        />
      )}
      {open?.kind === "settings" && <JobSettingsSheet projectId={jobId} settings={view.settings} companyTitle={view.company.title} onClose={close} onSaved={async () => (close(), await reload())} />}
      {open?.kind === "bring" && <BringInSheet projectId={jobId} sources={bringIn} onClose={close} onDone={async () => (close(), await reload())} />}
      {open?.kind === "rooms" && <RoomsSheet projectId={jobId} rooms={view.rooms} onClose={close} onSaved={reload} />}
    </>
  );
}
