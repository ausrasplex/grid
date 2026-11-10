import { can } from "@grid/core";
import { Alert, Button, Grid, Icon, LinkRow, List, PageHeader, Section, Stack, buttonVariants, cn } from "@grid/ui";
import { myActiveJobs, onSiteNow } from "@grid/block-projects";
import { JobRows } from "@grid/block-projects/components";
import { getContext } from "@/lib/context";
import { registry } from "@/blocks";

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
            <a href="/b/companies/switch">See invites</a>
          </Button>
          <Button asChild size="lg" variant="outline" block>
            <a href="/setup">Set up my own business</a>
          </Button>
        </div>
      </Stack>
    );
  }

  const [now, jobs] = await Promise.all([onSiteNow(ctx), myActiveJobs(ctx, 6)]);
  const canStart = can(ctx, "projects.create");
  const widgets = registry.menusFor("home.widgets", ctx);
  return (
    <Stack>
      <PageHeader
        title={`G'day, ${firstName}`}
        meta={new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
        actions={
          canStart ? (
            <a
              href="/b/projects/new"
              aria-label="New job"
              className={cn(buttonVariants(), "size-touch px-0 sm:w-auto sm:px-4")}
            >
              <Icon name="plus" />
              <span className="hidden sm:inline">New job</span>
            </a>
          ) : undefined
        }
      />

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
              <a href="/b/projects/new">New job</a>
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
