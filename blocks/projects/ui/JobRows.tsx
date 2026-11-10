// Job rows for lists on the site, level and Home pages.
import { EmptyState, Icon, List, Section } from "@grid/ui";
import type { JobSummary } from "../service";

const date = (value: Date | string) => new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function JobRows({ title, jobs, empty, showSite }: { title?: string; jobs: JobSummary[]; empty?: string; showSite?: boolean }) {
  if (!jobs.length && !empty) return null;
  return (
    <Section title={title} flush>
      {jobs.length === 0 ? (
        <EmptyState title={empty!} />
      ) : (
        <List>
          {jobs.map((job) => (
            <li key={job.id}>
              <a href={`/b/projects/${job.id}`} className="flex min-h-touch-lg items-center gap-3 px-4 py-3 hover:bg-muted active:bg-muted sm:px-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground [&_svg]:size-5">
                  <Icon name={job.status === "COMPLETED" ? "done" : "job"} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{job.name}</span>
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
