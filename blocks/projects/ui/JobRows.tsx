// Job rows for lists on the site, level and client pages (a server
// component: it asks other blocks for each active job's second status,
// "Active • Scheduled", in one go).
import type { RequestContext } from "@grid/core";
import { EmptyState, Icon, List, Section } from "@grid/ui";
import { withSecondStatus, type JobSummary } from "../service";
import { SecondStatus } from "./SecondStatus";

const date = (value: Date | string) => new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export async function JobRows({ ctx, title, jobs: plainJobs, empty, showSite }: { ctx: RequestContext; title?: string; jobs: JobSummary[]; empty?: string; showSite?: boolean }) {
  if (!plainJobs.length && !empty) return null;
  const jobs = await withSecondStatus(ctx, plainJobs);
  return (
    <Section title={title} flush>
      {jobs.length === 0 ? (
        <EmptyState title={empty!} />
      ) : (
        <List>
          {jobs.map((job) => (
            <li key={job.id}>
              <a href={`/jobs/${job.id}`} className="flex min-h-touch-lg items-center gap-3 px-4 py-3 hover:bg-muted active:bg-muted sm:px-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground [&_svg]:size-5">
                  <Icon name={job.status === "COMPLETED" ? "done" : "job"} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold">{job.name}</span>
                    {job.secondStatus && <SecondStatus status={job.secondStatus} />}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {[
                      job.jobNumber,
                      job.clientName,
                      showSite ? job.siteName : null,
                      job.status === "COMPLETED" && job.completedAt ? `Finished ${date(job.completedAt)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <Icon name="chevron-right" className="size-5 text-muted-foreground" />
              </a>
            </li>
          ))}
        </List>
      )}
    </Section>
  );
}
