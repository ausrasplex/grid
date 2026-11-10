// Scheduled jobs (pg-boss, queue kept in the same Postgres, schema "pgboss").
// Runs inside the app container. Today: the storage clean-up tick. Later:
// PDF rendering for the templates Block, backups, reminders.
// JOBS=off turns it off (e.g. a second app container).

import "server-only";
import PgBoss from "pg-boss";
import { backupTick, executeBackup, failInterruptedBackups } from "./backups";
import { cleanupTick } from "./cleanup";
import type { BlockJob } from "@grid/core";
import { registry } from "@/blocks";

let boss: PgBoss | null = null;

export async function startJobs() {
  if (boss || process.env.JOBS === "off" || !process.env.DATABASE_URL) return;
  // Only keep it once it has started: if the database is down at start-up,
  // queued work (plans, backups) runs straight away instead of failing.
  const starting = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: "pgboss" });
  starting.on("error", (error) => console.error("[jobs]", error));
  await starting.start();
  boss = starting;

  await boss.createQueue("core.tick");
  // Every 15 minutes; the clean-up itself decides whether it's due (lib/cleanup.ts).
  await boss.schedule("core.tick", process.env.JOBS_TICK_CRON || "*/15 * * * *", {}, { tz: process.env.TZ || "UTC" });
  await boss.work("core.tick", async () => {
    await cleanupTick();
    await backupTick();
  });

  // Backups can take a while (a large files share), so they get their own
  // queue with a long time limit, and are never retried automatically.
  await failInterruptedBackups();
  await boss.createQueue("core.backup", { expireInSeconds: 6 * 3600, retryLimit: 0 });
  await boss.work<{ runId: string }>("core.backup", async ([job]) => {
    if (job) await executeBackup(job.data.runId);
  });

  // Each block's own background work (e.g. plans.render), one queue each.
  for (const [name, job] of Object.entries(await blockJobs())) {
    await boss.createQueue(name, { expireInSeconds: job.expireInSeconds ?? 15 * 60, retryLimit: job.retryLimit ?? 1 });
    await boss.work<Record<string, unknown>>(name, { batchSize: 1 }, async (batch) => {
      for (const queued of batch) await job.handler(queued.data);
    });
  }
  console.log("[jobs] scheduled jobs started");
}

export async function stopJobs() {
  await boss?.stop({ graceful: true });
  boss = null;
}

/** Runs a backup recorded by createBackup() in the background. */
export async function enqueueBackup(runId: string) {
  if (boss) await boss.send("core.backup", { runId });
  else void executeBackup(runId); // scheduled jobs are off in this container: run it here
}

let jobsByName: Promise<Record<string, BlockJob>> | null = null;
function blockJobs() {
  jobsByName ??= (async () => {
    const all: Record<string, BlockJob> = {};
    for (const block of registry.blocks) {
      if (!block.jobs) continue;
      for (const [name, job] of Object.entries(await block.jobs())) {
        if (!name.startsWith(`${block.id}.`)) throw new Error(`Job "${name}" must start with "${block.id}."`);
        all[name] = job;
      }
    }
    return all;
  })();
  return jobsByName;
}

/** Queues a block's background job (app().jobs.send). */
export async function sendJob(name: string, data: Record<string, unknown>) {
  const job = (await blockJobs())[name];
  if (!job) throw new Error(`No job called "${name}"`);
  if (boss) {
    await boss.send(name, data);
    return;
  }
  // Scheduled jobs are off in this container: do it here, in the background.
  void job.handler(data).catch((error) => console.error(`[jobs] ${name} failed`, error));
}
