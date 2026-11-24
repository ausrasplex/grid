// The client's handover link (/h/<token>, docs/materials-block.md "The
// client's link"): the business, the job, and the list as on the PDF (by
// trade, then room, with photos), on a page that suits a phone. Download
// PDF gets the same landscape PDF. Nothing to change, so no browser code.

import { Download, ExternalLink, Package } from "lucide-react";
import { buttonVariants, cn } from "@grid/ui";
import type { PrintLine, ScheduleModel } from "../pdf";

export interface SharedHandoverJson {
  token: string;
  business: { name: string; phone: string | null; email: string | null; website: string | null; hasLogo: boolean };
  model: ScheduleModel;
  updatedAt: string | null;
}

const day = (date: string) => new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

function Line({ line, base, showQty }: { line: PrintLine; base: string; showQty: boolean }) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {line.photoFileId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <a href={`${base}/picture/${line.photoFileId}?v=display`} aria-label={`Bigger photo of ${line.product}`}>
            <img src={`${base}/picture/${line.photoFileId}`} alt="" className="size-20 object-contain" loading="lazy" />
          </a>
        ) : line.swatch ? (
          // The business's own colour, shown as is.
          <span aria-hidden className="size-full" style={{ backgroundColor: line.swatch }} />
        ) : (
          <Package aria-hidden className="size-6 text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        {line.item && <span className="block text-xs font-bold tracking-wide text-muted-foreground uppercase">{line.item}</span>}
        <span className="block font-semibold">{line.product}</span>
        {line.model && <span className="block text-sm text-muted-foreground">{line.model}</span>}
        {(line.finish || line.size) && <span className="block text-sm">{[line.finish, line.size].filter(Boolean).join(" · ")}</span>}
        {line.notes && <span className="block text-sm whitespace-pre-line text-muted-foreground">{line.notes}</span>}
        {line.link && (
          <a href={line.link} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex min-h-touch items-center gap-1 text-sm font-semibold text-primary">
            Product page <ExternalLink className="size-4" />
          </a>
        )}
      </span>
      {showQty && <span className={cn("shrink-0 font-semibold", line.qty === "TBC" && "text-muted-foreground")}>{line.qty === "TBC" ? "TBC" : `× ${line.qty}`}</span>}
    </li>
  );
}

export function SharedHandover({ view }: { view: SharedHandoverJson }) {
  const base = `/api/public/handover/h/${view.token}`;
  const { model, business } = view;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:py-10">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-bold">{business.name}</p>
          <p className="text-sm text-muted-foreground">
            {[business.phone, business.email].filter(Boolean).map((entry, index) => (
              <span key={entry}>
                {index > 0 && " · "}
                <a href={entry!.includes("@") ? `mailto:${entry}` : `tel:${entry!.replace(/\s+/g, "")}`} className="underline-offset-4 hover:underline">
                  {entry}
                </a>
              </span>
            ))}
          </p>
          {business.website && <p className="text-sm text-muted-foreground">{business.website}</p>}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {business.hasLogo && <img src={`${base}/logo`} alt={business.name} className="max-h-14 max-w-36 object-contain" />}
      </header>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{model.title}</h1>
        <p className="font-semibold">{model.jobName}</p>
        {model.address && <p className="text-muted-foreground">{model.address}</p>}
        {view.updatedAt && <p className="text-sm text-muted-foreground">Last updated {day(view.updatedAt)}</p>}
      </div>

      <a href={`${base}/pdf`} className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto sm:self-start")}>
        <Download /> Download PDF
      </a>

      {model.sections.length === 0 && <p className="text-muted-foreground">Nothing on the list yet.</p>}
      {model.sections.map((section) => (
        <section key={section.trade} className="flex flex-col gap-3" aria-label={section.name}>
          {model.sections.length > 1 && <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{section.name}</h2>}
          {section.rooms.map((room) => (
            <div key={room.room ?? ""} className="overflow-hidden rounded-xl border bg-card">
              <h3 className="border-b bg-muted px-4 py-2.5 font-bold tracking-wide uppercase">{room.room ?? "General"}</h3>
              <ul className="divide-y">
                {room.lines.map((line) => (
                  <Line key={line.id} line={line} base={base} showQty={model.showQty} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
