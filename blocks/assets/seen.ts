// Part 5 (docs/assets-block.md "What part 5 built"): when gear was last
// seen, and what that turns up.
//   - Scanning a tag counts as seeing it (POST /:id/seen, from the asset
//     page opened by a scan), as every move already does (custody.ts).
//   - Not seen: nothing has moved or scanned it for notSeenDays. A chip on
//     the list, the Not seen view, a line in Needs attention, and one email
//     to Owners and Foremen the morning it crosses the line.
//   - "Do you still have it?": gear with you, or that you left on a job,
//     not seen for stillGotItDays. Home asks you; Yes counts as seeing it,
//     No opens the Lost sheet. You get one email the morning it starts
//     (push comes with stage 6).
//   - The job's Assets on site: what's left on the job or with someone there.

import "server-only";
import { app, notFound, requireCompany, type RequestContext } from "@grid/core";
import { audit, db, routeCodeUrl } from "@grid/db";
import { holdersFor, type Holder } from "./custody";
import { tellManagers } from "./notify";
import { guessIcon } from "./category-icons";
import { DEFAULT_NOT_SEEN_DAYS, DEFAULT_STILL_GOT_IT_DAYS, crossesToday, howLong, lastSeenOf, localDay, notSeenSince, seenBefore } from "./sighting";
import type { ReminderSettingsInput } from "./validation";

const MOD = "assets";
const NOT_TRACKED = ["RETIRED", "LOST"] as const;

export interface ReminderSettings {
  notSeenDays: number;
  stillGotItDays: number;
}

export async function reminderSettings(companyId: string): Promise<ReminderSettings> {
  const row = await db.assetSettings.findUnique({ where: { companyId }, select: { notSeenDays: true, stillGotItDays: true } });
  return { notSeenDays: row?.notSeenDays ?? DEFAULT_NOT_SEEN_DAYS, stillGotItDays: row?.stillGotItDays ?? DEFAULT_STILL_GOT_IT_DAYS };
}

export async function getReminderSettings(ctx: RequestContext) {
  return reminderSettings(requireCompany(ctx));
}

export async function saveReminderSettings(ctx: RequestContext, input: ReminderSettingsInput) {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    await tx.assetSettings.upsert({ where: { companyId }, create: { companyId, ...input }, update: input });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "AssetSettings", entityId: companyId, action: "updated", diff: { notSeenDays: input.notSeenDays, stillGotItDays: input.stillGotItDays } });
  });
  return reminderSettings(companyId);
}

/** A scan (or "Yes, I've still got it"): it's been seen now. */
export async function markSeen(ctx: RequestContext, assetId: string) {
  const companyId = requireCompany(ctx);
  await db.$transaction(async (tx) => {
    const asset = await tx.asset.findFirst({ where: { id: assetId, companyId, deletedAt: null }, select: { id: true, number: true, name: true } });
    if (!asset) throw notFound("Asset not found");
    await tx.asset.update({ where: { id: asset.id }, data: { lastSeenAt: new Date() } });
    await audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Asset", entityId: asset.id, action: "seen", diff: { number: asset.number, name: asset.name } });
  });
  return { ok: true };
}

// ─── Not seen ───────────────────────────────────────────────────────────

/** Gear that might be not seen (a day early); notSeenSince decides exactly. */
const maybeNotSeen = (companyId: string, days: number) => {
  const cutoff = seenBefore(days);
  return {
    companyId,
    deletedAt: null,
    status: { notIn: [...NOT_TRACKED] },
    OR: [{ lastSeenAt: { lt: cutoff } }, { lastSeenAt: null, createdAt: { lt: cutoff } }],
  };
};

/** The ids of the business's gear not seen for its notSeenDays (the list's Not seen view). */
export async function notSeenIds(companyId: string) {
  const { notSeenDays } = await reminderSettings(companyId);
  const rows = await db.asset.findMany({ where: maybeNotSeen(companyId, notSeenDays), select: { id: true, lastSeenAt: true, createdAt: true, status: true } });
  return rows.filter((row) => notSeenSince(row, notSeenDays)).map((row) => row.id);
}

export async function notSeenCount(companyId: string) {
  return (await notSeenIds(companyId)).length;
}

// ─── Do you still have it? ──────────────────────────────────────────────

export interface StillGotIt {
  assetId: string;
  number: number;
  name: string;
  /** "With you · Smith St" or "On Smith St · Level 2". */
  where: string;
  /** "3 weeks". */
  howLong: string;
}

/** Your gear (with you, or left on a job by you) not seen for stillGotItDays, longest first. */
async function stillGotItFor(companyId: string, userId: string, days: number): Promise<StillGotIt[]> {
  const rows = await db.assetCustody.findMany({
    where: {
      companyId,
      toAt: null,
      OR: [{ holderType: "USER", userId }, { holderType: "PROJECT", byUserId: userId }],
      asset: { deletedAt: null, status: { notIn: [...NOT_TRACKED] } },
    },
    select: { asset: { select: { id: true, number: true, name: true, lastSeenAt: true, createdAt: true, status: true } } },
  });
  const due = rows.map((row) => row.asset).filter((asset) => notSeenSince(asset, days));
  const holders = await holdersFor(companyId, due.map((asset) => asset.id));
  return due
    .sort((first, second) => lastSeenOf(first).getTime() - lastSeenOf(second).getTime())
    .map((asset) => ({ assetId: asset.id, number: asset.number, name: asset.name, where: whereText(holders.get(asset.id)!), howLong: howLong(localDay(lastSeenOf(asset))) }));
}

const whereText = (holder: Holder) => (holder.kind === "USER" ? ["With you", holder.place].filter(Boolean).join(" · ") : holder.text);

export async function stillGotIt(ctx: RequestContext) {
  if (!ctx.companyId) return [];
  const { stillGotItDays } = await reminderSettings(ctx.companyId);
  return stillGotItFor(ctx.companyId, ctx.userId, stillGotItDays);
}

// ─── The job's Assets on site ───────────────────────────────────────────

export interface OnSite {
  assetId: string;
  number: number;
  name: string;
  categoryIcon: string | null;
  photoFileId: string | null;
  status: string;
  /** "With Sam T. · Level 2", or the building or level it's left on. */
  who: string;
  since: Date | null;
}

/** Gear left on a job, or with someone who took it there. */
export async function onSite(ctx: RequestContext, projectId: string): Promise<OnSite[]> {
  const companyId = requireCompany(ctx);
  const rows = await db.assetCustody.findMany({
    where: { companyId, projectId, toAt: null, holderType: { in: ["PROJECT", "USER"] }, asset: { deletedAt: null } },
    select: { levelId: true, buildingId: true, asset: { select: { id: true, number: true, name: true, status: true, photoFileIds: true, category: { select: { icon: true, name: true } } } } },
    orderBy: { fromAt: "asc" },
  });
  const holders = await holdersFor(companyId, rows.map((row) => row.asset.id));
  return rows.map(({ asset }) => {
    const holder = holders.get(asset.id)!;
    // The job's name is the page you're on: say who has it and where on the job.
    const area = holder.place?.split(" · ").slice(1).join(" · ") || null;
    const who = holder.kind === "USER" ? [`With ${holder.userId === ctx.userId ? "you" : (holder.userName ?? "someone who left")}`, area].filter(Boolean).join(" · ") : (area ?? "Left on the job");
    return {
      assetId: asset.id,
      number: asset.number,
      name: asset.name,
      categoryIcon: asset.category ? (asset.category.icon ?? guessIcon(asset.category.name)) : null,
      photoFileId: asset.photoFileIds[0] ?? null,
      status: asset.status,
      who,
      since: holder.since,
    };
  });
}

// ─── The morning emails ─────────────────────────────────────────────────

/**
 * Every morning (assets.morning, after the overdue check): one email per
 * business to Owners and Foremen for gear that's just gone past "not
 * seen", and one email per person for their gear that's just gone past
 * "still got it?". Each crosses the line once, so each goes once.
 */
export async function morningSightings(): Promise<void> {
  const settings = await db.assetSettings.findMany({ select: { companyId: true, notSeenDays: true, stillGotItDays: true } });
  const byCompany = new Map(settings.map((row) => [row.companyId, row]));
  const longest = Math.max(DEFAULT_NOT_SEEN_DAYS, DEFAULT_STILL_GOT_IT_DAYS, ...settings.flatMap((row) => [row.notSeenDays, row.stillGotItDays]));
  const shortest = Math.min(DEFAULT_NOT_SEEN_DAYS, DEFAULT_STILL_GOT_IT_DAYS, ...settings.flatMap((row) => [row.notSeenDays, row.stillGotItDays]));
  // Only gear last seen in this window can cross a line today (a day wider each end, for timezones).
  const window = { gte: seenBefore(longest + 3), lt: seenBefore(shortest) };
  const assets = await db.asset.findMany({
    where: { deletedAt: null, status: { notIn: [...NOT_TRACKED] }, OR: [{ lastSeenAt: window }, { lastSeenAt: null, createdAt: window }] },
    select: { id: true, companyId: true, number: true, name: true, tagCode: true, lastSeenAt: true, createdAt: true },
  });
  if (!assets.length) return;

  const notSeen = new Map<string, typeof assets>();
  const stillGotItAssets: typeof assets = [];
  for (const asset of assets) {
    const days = byCompany.get(asset.companyId) ?? { notSeenDays: DEFAULT_NOT_SEEN_DAYS, stillGotItDays: DEFAULT_STILL_GOT_IT_DAYS };
    if (crossesToday(lastSeenOf(asset), days.notSeenDays)) notSeen.set(asset.companyId, [...(notSeen.get(asset.companyId) ?? []), asset]);
    if (crossesToday(lastSeenOf(asset), days.stillGotItDays)) stillGotItAssets.push(asset);
  }

  for (const [companyId, list] of notSeen) {
    const days = byCompany.get(companyId)?.notSeenDays ?? DEFAULT_NOT_SEEN_DAYS;
    const lines = list.map((asset) => `- Asset No. ${asset.number}, ${asset.name}: ${routeCodeUrl(asset.tagCode)}`);
    await tellManagers(companyId, "", {
      subject: list.length === 1 ? `Not seen for ${days} days: Asset No. ${list[0]!.number}, ${list[0]!.name}` : `${list.length} assets not seen for ${days} days`,
      text: `Nothing has moved or scanned these for ${days} days. Scan them when you next see them, or report them lost:\n\n${lines.join("\n")}\n`,
    });
  }

  if (!stillGotItAssets.length) return;
  try {
    if (!(await app().mail.configured())) return;
    // Who it's with now, or who left it on a job.
    const custody = await db.assetCustody.findMany({
      where: { assetId: { in: stillGotItAssets.map((asset) => asset.id) }, toAt: null, holderType: { in: ["USER", "PROJECT"] } },
      select: { assetId: true, holderType: true, userId: true, byUserId: true, placeName: true },
    });
    const perPerson = new Map<string, string[]>();
    for (const row of custody) {
      const asset = stillGotItAssets.find((entry) => entry.id === row.assetId)!;
      const personId = row.holderType === "USER" ? row.userId : row.byUserId;
      if (!personId) continue;
      const where = row.holderType === "PROJECT" ? `, left on ${row.placeName ?? "a job"}` : "";
      perPerson.set(personId, [...(perPerson.get(personId) ?? []), `- Asset No. ${asset.number}, ${asset.name}${where}: ${routeCodeUrl(asset.tagCode)}`]);
    }
    const people = await db.user.findMany({ where: { id: { in: [...perPerson.keys()] } }, select: { id: true, email: true } });
    for (const person of people) {
      const lines = perPerson.get(person.id)!;
      if (!person.email) continue;
      await app().mail.send({
        to: person.email,
        subject: lines.length === 1 ? "Do you still have it?" : `Do you still have these ${lines.length} things?`,
        text: `Nothing has moved or scanned ${lines.length === 1 ? "this" : "these"} for a while. Open Grid and tap Yes if you've still got ${lines.length === 1 ? "it" : "them"}, or No to report ${lines.length === 1 ? "it" : "them"} lost:\n\n${lines.join("\n")}\n`,
      });
    }
  } catch (error) {
    console.error("[assets] couldn't send the 'still got it?' emails", error);
  }
}
