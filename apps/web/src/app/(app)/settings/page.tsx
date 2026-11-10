import { Grid, Icon, LinkRow, List, PageHeader, Section } from "@grid/ui";
import { getContext } from "@/lib/context";
import { registry } from "@/blocks";
import { SECURITY } from "@/components/AppShell";
import { Alert } from "@grid/ui";
import { db } from "@grid/db";

export default async function SettingsPage() {
  const ctx = (await getContext())!;
  const mine = [...registry.menusFor("settings.user", ctx), SECURITY];
  const company = ctx.company ? registry.menusFor("settings.company", ctx) : [];
  // The server admin hears about a failed backup here, not just in the log.
  const lastBackup = ctx.user.serverAdmin ? await db.backupRun.findFirst({ where: { trigger: "schedule" }, orderBy: { startedAt: "desc" } }) : null;

  return (
    <>
      <PageHeader title="Settings" />
      {lastBackup?.status === "failed" && (
        <div className="mb-4">
          <Alert variant="error">
            The last scheduled backup failed: {lastBackup.error}{" "}
            <a href="/settings/backups" className="font-semibold underline">Open Backups</a>
          </Alert>
        </div>
      )}
      <Grid>
        <Section title="You" flush>
          <List>
            {mine.map((item) => (
              <LinkRow key={item.id} href={item.href} label={item.label} icon={<Icon name={item.icon} />} />
            ))}
          </List>
        </Section>
        {ctx.company && (
          <Section title={ctx.company.name} flush>
            <List>
              {company.map((item) => (
                <LinkRow key={item.id} href={item.href} label={item.label} icon={<Icon name={item.icon} />} />
              ))}
            </List>
          </Section>
        )}
        {ctx.user.serverAdmin && (
          // Settings for the whole server (every business on it). Changed in
          // the app, not the Unraid template, so they need no restart.
          <Section title="Server" description="You're the server admin." flush>
            <List>
              <LinkRow href="/settings/email" label="Email" description="The email server for sign-in links and password resets" icon={<Icon name="mail" />} />
              <LinkRow href="/settings/backups" label="Backups" description="Database and photos: schedule, Back up now, downloads" icon={<Icon name="archive" />} />
              <LinkRow href="/settings/storage" label="Storage" description="Space used, clean-up settings and history" icon={<Icon name="archive" />} />
            </List>
          </Section>
        )}
      </Grid>
    </>
  );
}
