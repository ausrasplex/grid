// Pages for jobs and the places they happen.
//
//   /sites/<site>[/<building>[/<level>[/all]]]   site, building and level pages
//       (the "site" page below, at /jobs/site/...; next.config.ts shows it at /sites/...)
//   /sites/<site>/resume                         back to where you last were on a site
//   /jobs/<job>[/area/<building>[/<level>]]      a job, at one of its work areas
//   /jobs/<job>/settings                         job details and Covers
//   /jobs/new[/<site>]                           start a job
//   /jobs/search                                 Jump to
//   /jobs                                        every job in one table (phase 2e)

import { redirect } from "next/navigation";
import { can, notFound, type RequestContext } from "@grid/core";
import { Alert, Badge, HomeTile, Icon, LinkRow, List, PageHeader, Section, Stack, buttonVariants, cn, type BlockPages, type BlockPanels, type PanelRenderer } from "@grid/ui";
import { SiteNotes } from "@grid/block-sites/components";
import { getClient, type ClientPagePanelProps } from "@grid/block-clients";
import { getSite, recordLocation, type SiteStructure } from "@grid/block-sites";
import { activeJobCounts, getProject, jobsAt, jobsForClient, recordArea, resumeOnSite, type Area } from "../service";
import type { PlaceStartPanelProps } from "../index";
import { CopyLink, FinishJob } from "./JobActions";
import { DeleteJob, DeletedJobs, type DeletedJobJson } from "./DeleteJob";
import { deletedProjects } from "../delete";
import { getStorageSettings } from "@grid/db";
import { JobRows } from "./JobRows";
import { JobStorage } from "./JobStorage";
import { JobsTable } from "./JobsTable";
import { jobStorage, jobsTable } from "../storage";
import { JobSettings } from "./JobSettings";
import { JumpTo } from "./JumpTo";
import { LocationBar, type LocBuilding } from "./LocationBar";
import { NewJobForm } from "./NewJobForm";

const date = (date: Date) => date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const siteHref = (siteId: string, buildingId?: string | null, levelId?: string | null) => `/sites/${siteId}${buildingId ? `/${buildingId}` : ""}${levelId ? `/${levelId}` : ""}`;
const areaHref = (job: string, area: { buildingId: string; levelId: string | null }) => `/jobs/${job}/area/${area.buildingId}${area.levelId ? `/${area.levelId}` : ""}`;

/** Buildings with active-job counts, for the breadcrumb pickers. */
function locBuildings(site: SiteStructure, counts: Record<string, number>, jobAreas?: Area[]): LocBuilding[] {
  return site.buildings.map((building) => ({
    id: building.id,
    name: building.name,
    kind: building.kind,
    activeJobs: counts[building.id] ?? 0,
    levels: building.levels.map((level) => ({
      id: level.id,
      name: level.label,
      shortName: level.shortName,
      activeJobs: counts[level.id] ?? 0,
      covered: jobAreas?.some((jobArea) => jobArea.levelId === level.id),
    })),
  }));
}

/** A link styled as a page action: icon-only on phones, icon + label from sm up. */
function ActionLink({ href, icon, label, primary }: { href: string; icon: string; label: string; primary?: boolean }) {
  return (
    <a href={href} aria-label={label} title={label} className={cn(buttonVariants({ variant: primary ? "default" : "outline" }), "size-touch px-0 sm:w-auto sm:px-4")}>
      <Icon name={icon} />
      <span className="hidden sm:inline">{label}</span>
    </a>
  );
}

const isHouse = (site: SiteStructure) => site.buildings.length === 1 && site.buildings[0]!.kind === "SINGLE";

// ---------------------------------------------------------------------
// Site, building and level pages
// ---------------------------------------------------------------------

async function SitePage({ ctx, siteId }: { ctx: RequestContext; siteId: string }) {
  const { site, active, earlier, counts } = await jobsAt(ctx, { siteId });
  await recordLocation(ctx, { siteId });
  const canStructure = site.ownedByMe && can(ctx, "sites.structure.edit");
  const plain = isHouse(site);

  return (
    <>
      <LocationBar site={site} buildings={locBuildings(site, counts)} />
      <PageHeader
        title={site.name}
        meta={[site.address !== site.name ? site.address : null, site.kind === "MANAGED" ? "Managed site" : null].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <CopyLink codePath={`/sites/${site.id}/code`} />
            {can(ctx, "projects.create") && <ActionLink href={`/jobs/new/${site.id}`} icon="plus" label="New job here" primary />}
          </>
        }
      />
      <Stack>
        {site.archivedAt && (
          <Alert>Archived on {date(site.archivedAt)}, when its last job finished. Start a new job here to bring it back.</Alert>
        )}
        {!plain && <BuildingsSection site={site} counts={counts} />}
        <JobRows title="Current jobs" jobs={active} empty="No active jobs here" />
        {earlier.length > 0 && <JobRows title={plain ? "Earlier jobs at this address" : "Earlier jobs at this site"} jobs={earlier} />}
        <SiteNotes siteId={site.id} initial={site.notes} canEdit={can(ctx, "sites.notes.edit")} />
        {canStructure && (
          <Section flush>
            <List>
              <LinkRow
                href={`/sites/${site.id}/structure`}
                icon={<Icon name="layers" />}
                label="Buildings & levels"
                description={plain ? "Add a granny flat, shed or second storey" : `${site.buildings.length} building${site.buildings.length === 1 ? "" : "s"}`}
              />
            </List>
          </Section>
        )}
      </Stack>
    </>
  );
}

function BuildingsSection({ site, counts }: { site: SiteStructure; counts: Record<string, number> }) {
  return (
    <>
      {site.buildings.map((building) => (
        <Section key={building.id} title={building.name} description={building.kind === "MULTI" ? `${building.levels.length} levels` : "Single-level"} flush>
          <List>
            {building.kind === "MULTI" && building.levels.length > 0 ? (
              building.levels.map((level) => (
                <li key={level.id}>
                  <a href={siteHref(site.id, building.id, level.id)} className="flex min-h-touch items-center gap-3 px-4 py-2 hover:bg-muted sm:px-5">
                    <span className="w-12 shrink-0 rounded-md bg-muted py-1 text-center text-sm font-bold">{level.shortName}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{level.label}</span>
                    {(counts[level.id] ?? 0) > 0 && <Badge variant="default">{counts[level.id]} active</Badge>}
                    <Icon name="chevron-right" className="size-5 text-muted-foreground" />
                  </a>
                </li>
              ))
            ) : (
              <LinkRow
                href={siteHref(site.id, building.id)}
                icon={<Icon name="building" />}
                label={building.name}
                description={building.kind === "MULTI" ? "No levels yet" : `${counts[building.id] ?? 0} active job${counts[building.id] === 1 ? "" : "s"}`}
              />
            )}
          </List>
        </Section>
      ))}
    </>
  );
}

async function BuildingPage({ ctx, siteId, buildingId, panels }: { ctx: RequestContext; siteId: string; buildingId: string; panels: PanelRenderer }) {
  const { site, active, earlier, counts } = await jobsAt(ctx, { siteId, buildingId });
  const building = site.buildings.find((building) => building.id === buildingId);
  if (!building) throw notFound("Building not found");
  await recordLocation(ctx, { siteId, buildingId });
  return (
    <>
      <LocationBar site={site} buildings={locBuildings(site, counts)} buildingId={buildingId} />
      <PageHeader title={building.name} meta={site.name} />
      <Stack>
        {building.kind === "MULTI" && <BuildingsSection site={{ ...site, buildings: [building] }} counts={counts} />}
        {active.length > 0 ? (
          <JobRows title="Current jobs" jobs={active} />
        ) : (
          <StartHere ctx={ctx} panels={panels} place={{ siteId, buildingId, levelId: null, place: building.name }} />
        )}
        {earlier.length > 0 && <JobRows title="Finished here" jobs={earlier} />}
      </Stack>
    </>
  );
}

async function LevelPage({
  ctx,
  siteId,
  buildingId,
  levelId,
  all,
  panels,
}: {
  ctx: RequestContext;
  siteId: string;
  buildingId: string;
  levelId: string;
  all: boolean;
  panels: PanelRenderer;
}) {
  const { site, active, earlier, counts } = await jobsAt(ctx, { siteId, buildingId, levelId });
  const building = site.buildings.find((building) => building.id === buildingId);
  const level = building?.levels.find((level) => level.id === levelId);
  if (!building || !level) throw notFound("Level not found");
  // A job is picked automatically when it's the only one on the level.
  if (!all && active.length === 1) redirect(areaHref(active[0]!.id, { buildingId, levelId }));
  await recordLocation(ctx, { siteId, buildingId, levelId });
  return (
    <>
      <LocationBar site={site} buildings={locBuildings(site, counts)} buildingId={buildingId} levelId={levelId} />
      <PageHeader title={level.name} meta={[level.use, site.buildings.length > 1 ? building.name : null, site.name].filter(Boolean).join(" · ")} />
      <Stack>
        {active.length > 0 ? (
          <JobRows title="Jobs on this level" jobs={active} />
        ) : (
          <StartHere
            ctx={ctx}
            panels={panels}
            place={{ siteId, buildingId, levelId, place: site.buildings.length > 1 ? `${level.label} · ${building.name}` : level.label }}
          />
        )}
        {earlier.length > 0 && <JobRows title={`Finished here (${earlier.length})`} jobs={earlier} />}
      </Stack>
    </>
  );
}

/**
 * An empty building or floor: start work right here. "Add job" opens New job
 * with the site, building (and floor) already picked; other Blocks add their
 * own button through the "place.start" panel (Quotes: "Add quote").
 */
async function StartHere({ ctx, panels, place }: { ctx: RequestContext; panels: PanelRenderer; place: PlaceStartPanelProps }) {
  const others = await panels("place.start", { ...place });
  const canStart = can(ctx, "projects.create");
  const where = place.levelId ? "site, building and floor" : "site and building";
  return (
    <Section
      title={`Nothing ${place.levelId ? "on" : "in"} ${place.place} yet`}
      description={canStart || others.length ? `Start here: the ${where} are filled in for you.` : `No active jobs ${place.levelId ? "on this level" : "in this building"}.`}
    >
      {(canStart || others.length > 0) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {canStart && (
            <a href={`/jobs/new/${place.siteId}/${place.buildingId}${place.levelId ? `/${place.levelId}` : ""}`} className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
              <Icon name="plus" /> Add job
            </a>
          )}
          {others}
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------
// Job pages
// ---------------------------------------------------------------------

async function JobPage({
  ctx,
  jobId,
  want,
  panels,
}: {
  ctx: RequestContext;
  jobId: string;
  want: { buildingId: string; levelId: string | null } | null;
  panels: PanelRenderer;
}) {
  const job = await getProject(ctx, jobId);
  const { site, areas } = job;
  const same = (area: { buildingId: string; levelId: string | null }, other: { buildingId: string; levelId: string | null } | null) =>
    !!other && area.buildingId === other.buildingId && (area.levelId ?? null) === (other.levelId ?? null);

  // Which area: the one asked for, else where you were last, else the only one.
  // (An area can be outside the job's Covers: you arrived through a level that isn't covered.)
  const area: { buildingId: string; levelId: string | null } | null =
    want ?? areas.find((area) => same(area, job.lastArea)) ?? (areas.length === 1 ? areas[0]! : null);
  await recordArea(ctx, jobId, area, site.id);

  const here = await jobsAt(ctx, { siteId: site.id, buildingId: area?.buildingId, levelId: area?.levelId });
  const jobsHere = here.active.map((job) => ({
    id: job.id,
    name: job.name,
    meta: [job.jobNumber, job.clientName].filter(Boolean).join(" · ") || undefined,
    href: area ? areaHref(job.id, area) : `/jobs/${job.id}`,
  }));
  const allHref = area?.levelId ? `${siteHref(site.id, area.buildingId, area.levelId)}/all` : area && site.buildings.length > 1 ? siteHref(site.id, area.buildingId) : siteHref(site.id);
  const canEdit = job.isHost && can(ctx, "projects.edit");
  // A quote's job (Quoting / Not won) is moved along by its quote, not finished by hand.
  const quoteJob = job.status === "QUOTING" || job.status === "NOT_WON";
  const canFinish = job.isHost && can(ctx, "projects.complete") && !quoteJob;
  const storage = can(ctx, "projects.complete") ? await jobStorage(ctx, job.id) : null;
  const finishLeavesSiteEmpty = job.status === "ACTIVE" && here.site.activeJobs <= 1;
  const plain = isHouse(site);
  const currentArea = area ? areas.find((entry) => same(entry, area)) : undefined;
  // Things for the whole job (the checklist), from whichever Blocks are on.
  const topPanels = await panels("job.top", { job: { id: job.id, name: job.name, status: job.status, archived: !!job.archivedAt } });
  // Photos, notes (and later plans) for the area you're in, from whichever Blocks are on.
  const areaPanels = await panels("job.area", {
    job: { id: job.id, name: job.name, status: job.status, siteId: site.id },
    area: currentArea ?? null,
    areas,
    singleArea: areas.length <= 1,
  });

  return (
    <>
      <LocationBar
        site={site}
        buildings={locBuildings(site, here.counts, areas)}
        // No area picked yet: still show the building when the job is all in one.
        buildingId={area?.buildingId ?? (new Set(areas.map((area) => area.buildingId)).size === 1 ? areas[0]!.buildingId : null)}
        levelId={area?.levelId ?? null}
        job={{ id: job.id, name: job.name }}
        jobsHere={jobsHere.some((jobHere) => jobHere.id === job.id) ? jobsHere : [{ id: job.id, name: job.name, href: `/jobs/${job.id}` }, ...jobsHere]}
        allHref={allHref}
      />
      <PageHeader
        title={job.name}
        meta={[job.jobNumber ?? job.quoteNumber, job.clientName, job.archivedAt ? "Archived" : job.status === "COMPLETED" ? "Finished" : job.status === "QUOTING" ? "Quoting" : job.status === "NOT_WON" ? "Not won" : null].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <CopyLink codePath={`/projects/${job.id}/code`} />
            {canEdit && <ActionLink href={`/jobs/${job.id}/settings`} icon="settings" label="Settings" />}
          </>
        }
      />
      <div className="flex flex-col gap-4 sm:gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_26rem]">
      <Stack>
        {job.status === "QUOTING" && (
          <Alert>Quoting{job.quoteNumber ? ` for ${job.quoteNumber}` : ""}: it becomes a job when the quote is accepted. Upload plans and place icons for the take-off; it stays out of the Sites list until then.</Alert>
        )}
        {job.status === "NOT_WON" && <Alert>Not won{job.quoteNumber ? `: ${job.quoteNumber}` : ""} was declined or withdrawn. Its plans are kept in case the client comes back; revising the quote picks it up again.</Alert>}
        {job.archivedAt ? (
          <Alert>
            Archived on {date(job.archivedAt)}. Plans and documents are drawn again when you open them, for a quick look, and removed again after a while. Restore it to keep them, or reopen it to carry on.
          </Alert>
        ) : (
          job.status === "COMPLETED" &&
          job.completedAt && <Alert>Finished on {date(job.completedAt)}. It's listed under earlier jobs at {site.name}; reopen it to carry on.</Alert>
        )}

        {topPanels}

        {areas.length > 1 && (
          <section aria-label="Other work areas">
            <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Work areas</h2>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              {areas.map((entry) => {
                const on = same(entry, area);
                const label = entry.levelId ? (site.buildings.length > 1 ? `${entry.buildingName} · ${entry.shortName}` : entry.levelName!) : entry.buildingName;
                return (
                  <a
                    key={`${entry.buildingId}:${entry.levelId}`}
                    href={areaHref(job.id, entry)}
                    aria-current={on ? "location" : undefined}
                    className={cn(
                      "flex h-10 shrink-0 items-center rounded-full border-2 px-4 text-sm font-semibold whitespace-nowrap",
                      on ? "border-primary bg-accent text-accent-foreground" : "border-transparent bg-muted hover:bg-muted/70",
                    )}
                  >
                    {label}
                  </a>
                );
              })}
            </div>
          </section>
        )}

        {area && !currentArea && <Alert>This job doesn't cover this area. Pick one of its work areas above.</Alert>}

        {areaPanels.length > 0 ? (
          areaPanels
        ) : (
          <Section title={area && currentArea && !plain ? (currentArea.levelName ?? currentArea.buildingName) : "This job"}>
            <p className="text-muted-foreground">
              Photos, notes and plans for this job show here once those Blocks are on. Add them from the Store in Settings.
            </p>
          </Section>
        )}
      </Stack>

      <Stack>
        <Section title="Details" flush>
          <dl className="divide-y">
            <Detail label="Address" value={site.address} href={siteHref(site.id)} />
            {job.clientName && <Detail label="Client" value={job.clientName} href={job.clientId && can(ctx, "clients.view") ? `/clients/${job.clientId}` : undefined} />}
            {job.jobNumber && <Detail label="Job number" value={job.jobNumber} />}
            <Detail label="Started" value={date(job.startedAt)} />
            {!plain && <Detail label="Covers" value={coversText(job.covers, site)} />}
          </dl>
        </Section>

        <SiteNotes siteId={site.id} initial={site.notes} canEdit={can(ctx, "sites.notes.edit")} />

        {storage && <JobStorage storage={storage} />}

        {canFinish && (
          <FinishJob jobId={job.id} status={job.status as "ACTIVE" | "COMPLETED"} archived={!!job.archivedAt} archiveBytes={storage?.totals.archiveBytes ?? 0} siteName={site.name} lastActiveHere={finishLeavesSiteEmpty} />
        )}

        {/* Archived jobs only, Owners only: highly destructive (docs/stage-2-projects.md "Deleting a job"). */}
        {job.isHost && job.archivedAt && can(ctx, "projects.delete") && (
          <DeleteJob jobId={job.id} jobName={job.name} jobNumber={job.jobNumber} lines={storage?.lines ?? []} deletedDays={(await getStorageSettings()).deletedDays} />
        )}
      </Stack>
      </div>
    </>
  );
}

function Detail({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4 sm:px-5">
      <dt className="w-32 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium">{href ? <a href={href} className="underline-offset-4 hover:underline">{value}</a> : value}</dd>
    </div>
  );
}

function coversText(covers: { buildingId: string; levelId: string | null }[], site: SiteStructure): string {
  return site.buildings
    .map((building) => {
      const mine = covers.filter((cover) => cover.buildingId === building.id);
      if (!mine.length) return null;
      if (mine.some((cover) => !cover.levelId)) return `${building.name} (whole building)`;
      const names = building.levels.filter((level) => mine.some((cover) => cover.levelId === level.id)).map((level) => level.shortName);
      return `${building.name}: ${names.join(", ")}`;
    })
    .filter(Boolean)
    .join("; ");
}

/** What the client picker on job forms may do: see the list, add to it. */
const clientAccess = (ctx: RequestContext) => ({ canPick: can(ctx, "clients.view"), canAdd: can(ctx, "clients.add") });

export const pages: BlockPages = {
  "": async ({ ctx, params: [jobId, sub, buildingId, levelId], panels }) => {
    if (!jobId) {
      if (!can(ctx, "projects.view")) return <Alert variant="error">You don't have permission to see jobs.</Alert>;
      const table = await jobsTable(ctx);
      const deleted = can(ctx, "projects.delete") ? await deletedProjects(ctx) : [];
      return (
        <>
          <JobsTable
            rows={table.rows.map((row) => ({ ...row, startedAt: row.startedAt.toISOString(), archived: !!row.archivedAt }))}
            columns={table.columns}
            showStorage={table.showStorage}
            canCreate={can(ctx, "projects.create")}
          />
          <div className="mt-4">
            <DeletedJobs initial={JSON.parse(JSON.stringify(deleted)) as DeletedJobJson[]} />
          </div>
        </>
      );
    }
    if (sub === "settings") {
      const job = await getProject(ctx, jobId);
      const client = job.clientId && can(ctx, "clients.view") ? await getClient(ctx, job.clientId) : null;
      return (
        <JobSettings
          job={{ id: job.id, name: job.name, client: job.clientId ? (client ?? { id: job.clientId, name: job.clientName ?? "Client" }) : null, jobNumber: job.jobNumber, covers: job.covers }}
          site={job.site}
          clients={clientAccess(ctx)}
        />
      );
    }
    if (sub === "area" && buildingId) return <JobPage ctx={ctx} jobId={jobId} want={{ buildingId, levelId: levelId ?? null }} panels={panels} />;
    return <JobPage ctx={ctx} jobId={jobId} want={null} panels={panels} />;
  },

  site: async ({ ctx, params: [siteId, buildingId, levelId, mode], panels }) => {
    if (!siteId) redirect("/sites");
    if (buildingId === "resume") redirect(await resumeOnSite(ctx, siteId));
    if (buildingId && levelId) return <LevelPage ctx={ctx} siteId={siteId} buildingId={buildingId} levelId={levelId} all={mode === "all"} panels={panels} />;
    if (buildingId) return <BuildingPage ctx={ctx} siteId={siteId} buildingId={buildingId} panels={panels} />;
    return <SitePage ctx={ctx} siteId={siteId} />;
  },

  // /jobs/new, /jobs/new/<site>, or /jobs/new/<site>/<building>[/<level>] (from an empty floor).
  new: async ({ ctx, params: [siteId, buildingId, levelId] }) => {
    if (!can(ctx, "projects.create")) return <Alert variant="error">You don't have permission to start jobs.</Alert>;
    const site = siteId ? await getSite(ctx, siteId) : null;
    const building = buildingId ? site?.buildings.find((candidate) => candidate.id === buildingId) : undefined;
    const level = levelId ? building?.levels.find((candidate) => candidate.id === levelId) : undefined;
    const cover = building ? { buildingId: building.id, levelId: level?.id ?? null } : undefined;
    return <NewJobForm site={site} cover={cover} clients={clientAccess(ctx)} />;
  },

  search: () => <JumpTo />,
};


export const panels: BlockPanels = {
  // Home (Soft look): a tile with your active jobs.
  "home.tiles": async ({ ctx }) => {
    if (!can(ctx, "projects.view")) return null;
    const { jobs, sites } = await activeJobCounts(ctx);
    return <HomeTile label="Active jobs" value={String(jobs)} foot={jobs ? `On ${sites} site${sites === 1 ? "" : "s"}` : "Start one with New job"} href="/sites" />;
  },
  // On a client's page: their active jobs, and the last few finished.
  "client.page": async (props) => {
    const { ctx, clientIds, clientName } = props as typeof props & ClientPagePanelProps;
    if (!can(ctx, "projects.view")) return null;
    const { active, earlier, earlierCount } = await jobsForClient(ctx, clientIds);
    if (!active.length && !earlier.length) return null;
    return (
      <>
        <JobRows title={`Active jobs (${active.length})`} jobs={active} empty={`No active jobs for ${clientName}.`} showSite />
        {earlier.length > 0 && <JobRows title={earlierCount > earlier.length ? `Earlier jobs (latest ${earlier.length} of ${earlierCount})` : "Earlier jobs"} jobs={earlier} showSite />}
      </>
    );
  },
};
