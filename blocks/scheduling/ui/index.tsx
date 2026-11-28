// Scheduling pages and panels (docs/scheduling-block.md):
//   /schedule            the agenda and "To be booked"
//   /schedule/settings   Settings › Scheduling & time off
// Panels: the job page's Visits (job.top), and Home's "Today" card (home.top).
import { can, notFound } from "@grid/core";
import { myTimeOff } from "@grid/block-companies";
import type { JobTopPanelProps } from "@grid/block-projects";
import { AttentionRow, Section, cn, type BlockPages, type BlockPanels } from "@grid/ui";
import { agenda, businessSettings, getSettings, jobVisits, toBeBooked, today as todaysVisits } from "../service";
import { addDays, localDay } from "../times";
import { timeWords } from "../words";
import { JobVisits } from "./JobVisits";
import { Schedule } from "./Schedule";
import { SchedulingSettings } from "./SchedulingSettings";
import { json, type AgendaDayJson, type FeedJson, type LeaveJson, type ToBookJson, type VisitJson } from "./types";
import { myFeed } from "../feed";

export const pages: BlockPages = {
  settings: async ({ ctx, params: [extra] }) => {
    if (!can(ctx, "scheduling.view") || extra) throw notFound("Page not found");
    const today = localDay(new Date());
    const [settings, timeOff, feed] = await Promise.all([getSettings(ctx), myTimeOff(ctx, today), myFeed(ctx)]);
    return (
      <SchedulingSettings
        business={settings.business}
        mine={settings.mine}
        timeOff={json<LeaveJson[]>(timeOff)}
        feed={json<FeedJson>(feed)}
        canChangeBusiness={can(ctx, "scheduling.settings")}
        today={today}
      />
    );
  },
  "": async ({ ctx, params: [first] }) => {
    if (!can(ctx, "scheduling.view") || first) throw notFound("Page not found");
    const today = localDay(new Date());
    const [days, toBook, settings] = await Promise.all([agenda(ctx, { from: today, to: addDays(today, 13) }), toBeBooked(ctx), getSettings(ctx)]);
    return (
      <Schedule
        initialDays={json<AgendaDayJson[]>(days)}
        toBook={json<ToBookJson[]>(toBook)}
        today={today}
        settings={{ ...settings.business, dailyVisitWarningLimit: settings.mine.dailyVisitWarningLimit }}
        canBook={can(ctx, "scheduling.visits.book")}
      />
    );
  },
};

export const panels: BlockPanels = {
  // Top of the job page: its visits. Not on a quote's job (it isn't work yet).
  "job.top": async (props) => {
    const { ctx, job } = props as typeof props & JobTopPanelProps;
    if (!can(ctx, "scheduling.view") || job.status === "QUOTING" || job.status === "NOT_WON") return null;
    const [visits, settings] = await Promise.all([jobVisits(ctx, job.id), businessSettings(ctx.companyId!)]);
    const readOnly = job.archived || job.status === "COMPLETED";
    // A finished job with nothing booked: nothing to say.
    if (readOnly && !visits.length) return null;
    return (
      <JobVisits
        jobId={job.id}
        jobName={job.name}
        initial={json<VisitJson[]>(visits)}
        today={localDay(new Date())}
        defaultLengthMinutes={settings.defaultVisitLengthMinutes}
        canBook={can(ctx, "scheduling.visits.book")}
        canComplete={can(ctx, "projects.complete")}
        readOnly={readOnly}
      />
    );
  },
  // Home (Grid look): today's visits, when there are any.
  "home.top": async ({ ctx }) => {
    if (!ctx.companyId || !can(ctx, "scheduling.view")) return null;
    const today = await todaysVisits(ctx);
    const open = today.visits.filter((visit) => visit.status === "BOOKED");
    if (!open.length) return null;
    return (
      <Section title="Today" description={`${open.length} visit${open.length === 1 ? "" : "s"} booked`} flush>
        <ul className="divide-y">
          {open.map((visit) => (
            <li key={visit.id}>
              <a href={`/jobs/${visit.job.id}`} className={cn("flex min-h-touch-lg items-center gap-3 px-4 py-3 hover:bg-muted sm:px-6", visit.isTentative && "opacity-70")}>
                <span className="w-[4.75rem] shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums">{visit.isAllDay ? "All day" : timeWords(visit.startTime)}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{visit.job.name}</span>
                  <span className="truncate text-sm text-muted-foreground">{[visit.label, visit.job.suburb, visit.isTentative ? "Tentative" : null].filter(Boolean).join(" · ") || "Visit"}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Section>
    );
  },
  // Home (Soft look's Needs attention): visits still tentative this week, and won jobs with nothing booked.
  // (Its three tiles are already taken by jobs, quotes and tickets.)
  "home.attention": async ({ ctx }) => {
    if (!ctx.companyId || !can(ctx, "scheduling.view")) return null;
    const today = localDay(new Date());
    const [week, toBook] = await Promise.all([agenda(ctx, { from: today, to: addDays(today, 6) }), toBeBooked(ctx)]);
    const seen = new Set<string>();
    const tentative = week.flatMap((day) => day.visits).filter((visit) => visit.isTentative && visit.status === "BOOKED" && !seen.has(visit.id) && seen.add(visit.id));
    if (!tentative.length && !toBook.length) return null;
    return (
      <>
        {tentative.map((visit) => (
          <AttentionRow
            key={visit.id}
            title={`Not confirmed: ${visit.job.name}`}
            badge="Tentative"
            tone="warning"
            description={`${visit.when}. Confirm it on the job once it's locked in.`}
            href={`/jobs/${visit.job.id}`}
          />
        ))}
        {toBook.length > 0 && (
          <AttentionRow
            title={`${toBook.length} job${toBook.length === 1 ? "" : "s"} to be booked`}
            badge="To book"
            description="Won, with no visit booked."
            href="/schedule?show=tobook"
          />
        )}
      </>
    );
  },
};
