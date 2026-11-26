// The asset register PDF (docs/assets-block.md "What part 4b built"),
// Docket's Insurance Report for a business: every asset in service, by
// category, with serials, what was paid and what it would cost to replace,
// its warranty and where it is. From the Assets list's header.

import "server-only";
import { requireCompany, type RequestContext } from "@grid/core";
import { audit, db, openStoredFile } from "@grid/db";
import { holdersFor } from "./custody";
import type { RegisterGroup, RegisterLine } from "./register-document";

const MOD = "assets";

const day = (date: Date | null) => (date ? date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null);
const amount = (value: { toString(): string } | null) => (value === null ? null : Number(value.toString()));

async function thumb(companyId: string, fileId: string): Promise<string | null> {
  const file = await db.storedFile.findFirst({ where: { id: fileId, companyId, purgedAt: null } });
  if (!file) return null;
  try {
    const { stream, mime } = await openStoredFile(file, "thumb");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return `data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function registerPdf(ctx: RequestContext) {
  const companyId = requireCompany(ctx);
  const rows = await db.asset.findMany({
    where: { companyId, deletedAt: null, status: { not: "RETIRED" } },
    include: { category: { select: { name: true, sort: true } }, parts: { where: { deletedAt: null }, orderBy: { sort: "asc" } } },
    orderBy: { number: "asc" },
  });
  const holders = await holdersFor(companyId, rows.map((row) => row.id));
  const byCategory = new Map<string, { sort: number; lines: RegisterLine[] }>();
  for (const row of rows) {
    const key = row.category?.name ?? "No category";
    const group = byCategory.get(key) ?? { sort: row.category?.sort ?? Number.MAX_SAFE_INTEGER, lines: [] };
    group.lines.push({
      number: row.number,
      name: row.name,
      makeModel: [row.make, row.model].filter(Boolean).join(" "),
      serial: row.serial,
      pieces: row.parts.map((part) => (part.serial ? `${part.name} (SN ${part.serial})` : part.name)).join(", ") || null,
      bought: day(row.purchasedOn),
      supplier: row.supplier,
      paid: amount(row.purchasePrice),
      replacement: amount(row.replacementValue),
      warranty: day(row.warrantyEndsOn),
      where: holders.get(row.id)?.text ?? "",
      photo: row.photoFileIds[0] ? await thumb(companyId, row.photoFileIds[0]) : null,
    });
    byCategory.set(key, group);
  }
  const groups: RegisterGroup[] = [...byCategory.entries()].sort((a, b) => a[1].sort - b[1].sort || a[0].localeCompare(b[0])).map(([category, group]) => ({ category, lines: group.lines }));

  const [{ themeFor, renderPdf, toHtml }, { RegisterDocument }, { createElement }] = await Promise.all([import("@grid/block-templates"), import("./register-document"), import("react")]);
  const theme = await themeFor(companyId);
  const made = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: process.env.TZ || "Australia/Melbourne" });
  const pdf = await renderPdf(await toHtml(createElement(RegisterDocument, { owner: theme.companyName, logo: theme.logoDataUrl, made, groups })), { landscape: true, footer: `${theme.companyName} · Asset register · ${made}` });
  await db.$transaction((tx) => audit(tx, { blockId: MOD, actorId: ctx.userId, companyId, entityType: "Asset", entityId: companyId, action: "exported", diff: { what: "asset register", assets: rows.length } }));
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="Asset register ${new Date().toISOString().slice(0, 10)}.pdf"`, "cache-control": "private, no-store" },
  });
}
