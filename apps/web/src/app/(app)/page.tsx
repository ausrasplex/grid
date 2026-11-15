import { Fragment, type ReactNode } from "react";
import { can } from "@grid/core";
import { Alert, AttentionList, Button, Grid, Icon, LinkRow, List, PageHeader, Section, Stack, buttonVariants, cn, lookOf } from "@grid/ui";
import { activeJobCounts, myActiveJobs, onSiteNow } from "@grid/block-projects";
import { JobRows } from "@grid/block-projects/components";
import { getContext, type AppContext } from "@/lib/context";
import { registry, renderPanels, resolvePanels } from "@/blocks";

export default async function HomePage() {
  const ctx = (await getContext())!; // layout guarantees signed in
  const firstName = ctx.user.name.split(" ")[0] ?? ctx.user.name;

  if (!ctx.company) {
    return (
      <Stack>
        <PageHeader title={`G'day, ${firstName}`} />
        <Alert>You've been invited to a business. Accept the invite to start, or set up your own.</Alert>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild size="lg" block>
            <a href="/business/switch">See invites</a>
          </Button>
          <Button asChild size="lg" variant="outline" block>
            <a href="/setup">Set up my own business</a>
          </Button>
        </div>
      </Stack>
    );
  }

  if (lookOf(ctx.user.theme) === "soft") return <SoftHome ctx={ctx} firstName={firstName} />;

  const [now, jobs] = await Promise.all([onSiteNow(ctx), myActiveJobs(ctx, 6)]);
  const canStart = can(ctx, "projects.create");
  const widgets = registry.menusFor("home.widgets", ctx);
  // Cards Blocks put at the top of Home (panel slot "home.top"), e.g. tickets about to expire.
  const topCards = await renderPanels(ctx, "home.top", {});
  return (
    <Stack>
      <PageHeader
        title={`G'day, ${firstName}`}
        meta={new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
        actions={
          canStart ? (
            <a
              href="/jobs/new"
              aria-label="New job"
              className={cn(buttonVariants(), "size-touch px-0 sm:w-auto sm:px-4")}
            >
              <Icon name="plus" />
              <span className="hidden sm:inline">New job</span>
            </a>
          ) : undefined
        }
      />

      {topCards}

      {now ? (
        <a href={now.href} className="block rounded-xl bg-accent p-4 text-accent-foreground transition-opacity hover:opacity-90 sm:p-5">
          <span className="text-xs font-semibold tracking-wide uppercase opacity-80">On site now</span>
          <span className="mt-1 block text-xl font-bold">{now.job?.name ?? now.site.name}</span>
          <span className="mt-0.5 block text-sm opacity-90">
            {[now.job ? now.site.name : now.site.address !== now.site.name ? now.site.address : null, now.levelName].filter(Boolean).join(" · ")}
          </span>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold">
            Carry on <Icon name="chevron-right" className="size-4" />
          </span>
        </a>
      ) : (
        <Section title="Start your first job">
          <p className="mb-4 text-muted-foreground">
            Type the address and give it a name. The site, its history and its notes build up from there.
          </p>
          {canStart && (
            <Button asChild size="lg">
              <a href="/jobs/new">New job</a>
            </Button>
          )}
        </Section>
      )}

      {jobs.length > 0 && <JobRows title="Your active jobs" jobs={jobs} showSite />}

      {widgets.length > 0 && (
        <Grid>
          <Section flush>
            <List>
              {widgets.map((widget) => (
                <LinkRow key={widget.id} href={widget.href} label={widget.label} icon={<Icon name={widget.icon} />} />
              ))}
            </List>
          </Section>
        </Grid>
      )}
    </Stack>
  );
}

/** "Good morning", by the server's clock (TZ, Australia/Melbourne by default). */
function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-AU", { hour: "numeric", hourCycle: "h23", timeZone: process.env.TZ || undefined }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const TILE_COLOURS = ["bg-tile-1", "bg-tile-2", "bg-tile-3"];

/**
 * Home in the Soft look (docs/visual-style.md "Themes"): a greeting, a navy
 * hero card with up to three numbered tiles (panel slot "home.tiles"), the
 * "Needs attention" list ("home.attention"), then your jobs and shortcuts
 * side by side.
 */
async function SoftHome({ ctx, firstName }: { ctx: AppContext; firstName: string }) {
  const [now, jobs, counts, tiles, attention] = await Promise.all([
    onSiteNow(ctx),
    myActiveJobs(ctx, 5),
    activeJobCounts(ctx),
    resolvePanels(ctx, "home.tiles", {}),
    resolvePanels(ctx, "home.attention", {}),
  ]);
  const canStart = can(ctx, "projects.create");
  const widgets = registry.menusFor("home.widgets", ctx);
  const shownTiles = tiles.slice(0, 3);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[1.625rem] leading-tight font-bold tracking-[-0.02em]">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-muted-foreground">{new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        {canStart && (
          <a href="/jobs/new" aria-label="New job" className={cn(buttonVariants(), "size-touch px-0 sm:w-auto sm:px-5")}>
            <Icon name="plus" />
            <span className="hidden sm:inline">New job</span>
          </a>
        )}
      </header>

      {/* Hero: the headline on the left, numbered tiles on the right */}
      <section className="grid gap-4 rounded-[18px] bg-hero p-5 text-hero-foreground sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-center lg:gap-6">
        <div className="px-1 py-2 lg:py-6">
          <p className="text-sm opacity-80">Across your jobs</p>
          <p className="mt-2 text-[1.625rem] leading-tight font-bold tracking-[-0.02em]">
            {counts.jobs
              ? `${counts.jobs} active job${counts.jobs === 1 ? "" : "s"} on ${counts.sites} site${counts.sites === 1 ? "" : "s"}.`
              : "No active jobs yet."}
          </p>
          {now ? (
            <a href={now.href} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold opacity-90 hover:opacity-100">
              On site now: {now.job?.name ?? now.site.name}
              {now.levelName ? ` · ${now.levelName}` : ""} <Icon name="chevron-right" className="size-4" />
            </a>
          ) : (
            <p className="mt-3 text-sm opacity-80">{canStart ? "Start a job with New job, then everything builds up from the site." : "Jobs you're on show here."}</p>
          )}
        </div>
        {shownTiles.length > 0 && (
          <div className={cn("grid gap-3", shownTiles.length === 3 ? "sm:grid-cols-3" : shownTiles.length === 2 ? "sm:grid-cols-2" : "")}>
            {shownTiles.map((tile, index) => (
              <div key={tile.blockId} className={cn("flex min-h-32 flex-col rounded-[16px] p-4 sm:min-h-44 text-tile-foreground", TILE_COLOURS[index])}>
                <span className="mb-3 text-xs font-medium opacity-70">{String(index + 1).padStart(2, "0")}</span>
                <div className="flex-1">{tile.node}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {attention.length > 0 && (
        <AttentionList subtitle="Across your tickets, quotes and jobs">{attention.map((item) => <Fragment key={item.blockId}>{item.node}</Fragment>)}</AttentionList>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <SoftCard title="Your jobs" subtitle={counts.jobs ? `${counts.jobs} active` : "Nothing active yet"} href="/sites" linkLabel="View all">
          {jobs.length ? <JobRows jobs={jobs} showSite /> : <p className="px-5 pb-5 text-muted-foreground">Start a job and it shows here.</p>}
        </SoftCard>
        {widgets.length > 0 && (
          <SoftCard title="Shortcuts">
            <List>
              {widgets.map((widget) => (
                <LinkRow key={widget.id} href={widget.href} label={widget.label} icon={<Icon name={widget.icon} />} />
              ))}
            </List>
          </SoftCard>
        )}
      </div>
    </div>
  );
}

function SoftCard({ title, subtitle, href, linkLabel, children }: { title: string; subtitle?: string; href?: string; linkLabel?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[24px] bg-card">
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-2">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {href && (
          <a href={href} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}>
            {linkLabel ?? "View all"}
          </a>
        )}
      </div>
      {/* JobRows brings its own card; inside here it sits flat */}
      <div className="[&_[data-slot=card]]:rounded-none [&_[data-slot=card]]:bg-transparent">{children}</div>
    </section>
  );
}
