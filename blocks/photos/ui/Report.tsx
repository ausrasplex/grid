// A photo report for the customer or the CES: before and after photos with
// captions, areas and dates. Print it, or save it as a PDF from the print dialog.
import { PageHeader } from "@grid/ui";
import type { PhotoItem } from "../service";
import { areaLabel, type AreaOpt } from "./areas";
import { PrintButton } from "./PrintButton";

interface Props {
  job: { id: string; name: string; jobNumber: string | null; clientName: string | null; address: string; company: string };
  areas: AreaOpt[];
  photos: PhotoItem[];
}

const date = (date: Date) => date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function Report({ job, areas, photos }: Props) {
  const oldestFirst = [...photos].sort((first, second) => first.at.getTime() - second.at.getTime());
  const groups = [
    { title: "Before", items: oldestFirst.filter((photo) => photo.tag === "BEFORE") },
    { title: "After", items: oldestFirst.filter((photo) => photo.tag === "AFTER") },
    { title: "Other photos", items: oldestFirst.filter((photo) => photo.tag === "NONE") },
  ].filter((group) => group.items.length);

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="Photo report" meta={job.name} actions={<PrintButton />} />
      </div>
      <article className="paper rounded-xl bg-background p-5 text-foreground sm:p-8 print:rounded-none print:p-0">
        <header className="mb-6 border-b pb-4">
          <p className="text-sm text-muted-foreground">{job.company}</p>
          <h1 className="text-2xl font-bold">{job.name}</h1>
          <p className="text-sm">
            {[job.address, job.clientName, job.jobNumber, `${photos.length} photo${photos.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
          </p>
        </header>
        {groups.length === 0 && <p className="text-muted-foreground">No photos on this job yet.</p>}
        {groups.map((group) => (
          <section key={group.title} className="mb-8 break-inside-avoid-page">
            <h2 className="mb-3 text-lg font-bold">{group.title}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
              {group.items.map((item) => (
                <figure key={item.id} className="break-inside-avoid">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${item.fileId}?v=display`} alt={item.caption ?? ""} className="aspect-[4/3] w-full rounded-md bg-muted object-cover" />
                  <figcaption className="mt-1 text-sm">
                    {item.caption && <span className="font-semibold">{item.caption}. </span>}
                    <span className="text-muted-foreground">{[areas.length > 1 ? areaLabel(areas, item.buildingId, item.levelId) : null, date(item.at)].filter(Boolean).join(" · ")}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ))}
      </article>
    </>
  );
}
