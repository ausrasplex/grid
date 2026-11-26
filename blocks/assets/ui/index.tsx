// Assets pages (docs/assets-block.md §1).
//   /assets              the list: search, scan, categories, retired, Select → Print tags
//   /assets/<id>         one asset: where it is and its Actions, photos, details, its fields, the QR tag, its history
//   /assets/categories   Settings › Asset categories (and each one's fields)

import { can, notFound, type RequestContext } from "@grid/core";
import { Alert, AttentionRow, PageHeader, Section, Stack, type BlockPages, type BlockPanels } from "@grid/ui";
import { getAsset, listAssets, listCategories } from "../service";
import { tagSvg } from "../stickers";
import { history } from "../custody";
import { faultsFor, openFaults, attention } from "../faults";
import { currentLoss } from "../lost";
import { FaultCard } from "./FaultCard";
import { FaultsList } from "./FaultsList";
import { RetireLost } from "./RetireLost";
import { CustodyActions } from "./CustodyActions";
import { AssetActions } from "./AssetActions";
import { Assets } from "./Assets";
import { Categories } from "./Categories";
import { assetMeta, fieldText, photoUrl, statusWords, when, type AssetJson, type CategoryJson, type MoveJson } from "./shared";

/** Dates → strings, the way they reach a client component anyway. */
const json = <T,>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

export const pages: BlockPages = {
  faults: async ({ ctx }) => {
    if (!can(ctx, "assets.faults.manage")) throw notFound("Page not found");
    return <FaultsList initial={json(await openFaults(ctx))} />;
  },
  categories: async ({ ctx }) => {
    if (!can(ctx, "assets.manage")) throw notFound("Page not found");
    return <Categories initial={json<CategoryJson[]>(await listCategories(ctx))} />;
  },
  "": async ({ ctx, params: [first, extra] }) => {
    if (!can(ctx, "assets.view") || extra) throw notFound("Page not found");
    if (first) return <AssetPage ctx={ctx} assetId={first} />;
    const [assets, categories] = await Promise.all([listAssets(ctx), listCategories(ctx)]);
    return <Assets initial={json<AssetJson[]>(assets)} categories={json<CategoryJson[]>(categories)} canManage={can(ctx, "assets.manage")} />;
  },
};

const day = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : null);

async function AssetPage({ ctx, assetId }: { ctx: RequestContext; assetId: string }) {
  const [{ asset, fields }, qr, categories, moves] = await Promise.all([
    getAsset(ctx, assetId),
    tagSvg(ctx, assetId),
    can(ctx, "assets.manage") ? listCategories(ctx) : Promise.resolve([]),
    history(ctx, assetId),
  ]);
  const [faults, loss] = await Promise.all([faultsFor(ctx, assetId), currentLoss(ctx, assetId)]);
  const open = faults.find((fault) => fault.open) ?? null;
  const unsafe = faults.find((fault) => fault.open && fault.doNotUse);
  const details: { label: string; value: string | null }[] = [
    { label: "Category", value: asset.category },
    { label: "Make", value: asset.make },
    { label: "Model", value: asset.model },
    { label: "Serial number", value: asset.serial },
    ...fields.map((field) => ({ label: field.label, value: fieldText(field, asset.fields[field.key]) })),
    { label: "Bought", value: day(asset.purchasedOn) },
    { label: "Barcode", value: asset.barcode },
    { label: "Notes", value: asset.notes },
  ];
  const [main, ...more] = asset.photoFileIds;

  return (
    <>
      <a href="/assets" className="mb-2 inline-flex min-h-touch items-center text-sm font-semibold text-muted-foreground hover:text-foreground">
        ← Assets
      </a>
      <PageHeader
        title={asset.name}
        meta={[`Asset No. ${asset.number}`, asset.status !== "IN_SERVICE" ? statusWords(asset.status) : null, assetMeta(asset, false) || null].filter(Boolean).join(" · ")}
        actions={can(ctx, "assets.manage") ? <AssetActions asset={json<AssetJson>(asset)} categories={json<CategoryJson[]>(categories)} /> : undefined}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Stack>
          {unsafe && (
            <div role="alert" className="rounded-xl bg-destructive p-4 text-destructive-foreground">
              <p className="text-lg font-bold">Do not use</p>
              <p>
                {unsafe.note ? `"${unsafe.note}". ` : ""}Reported by {unsafe.reportedBy}, {when(json<string>(unsafe.reportedAt))}.
              </p>
            </div>
          )}
          {loss && (
            <div role="alert" className="flex flex-col gap-2 rounded-xl bg-destructive/15 p-4">
              <p className="text-lg font-bold">{loss.retired ? "Retired as lost" : loss.kind === "STOLEN" ? "Reported stolen" : "Reported lost"}</p>
              <p className="text-sm">
                {[loss.lastKnown ? `Last known: ${loss.lastKnown}` : null, `Reported by ${loss.reportedBy}, ${when(json<string>(loss.reportedAt))}`, loss.policeReport ? `Police report ${loss.policeReport}` : null].filter(Boolean).join(". ")}.
              </p>
              {loss.note && <p className="text-sm whitespace-pre-line">{loss.note}</p>}
              {!loss.retired && can(ctx, "assets.lost.retire") && <RetireLost assetId={asset.id} />}
            </div>
          )}
          {asset.status === "RETIRED" && !loss && <Alert>Retired: it&apos;s off the list, with its history kept. Its tag still opens this page.</Alert>}
          <div className="flex flex-col gap-3 rounded-xl bg-card p-4 sm:p-5">
            <div>
              <p className="text-sm text-muted-foreground">Where it is</p>
              <p className="text-lg font-semibold">{asset.holder.userId === ctx.userId ? ["With you", asset.holder.place].filter(Boolean).join(" · ") : asset.holder.text}</p>
              {asset.holder.since && <p className="text-sm text-muted-foreground">Since {when(json<string>(asset.holder.since))}</p>}
            </div>
            {(can(ctx, "assets.custody") || can(ctx, "assets.faults.report")) && (
              <CustodyActions
                asset={json<AssetJson>(asset)}
                userId={ctx.userId}
                canCustody={can(ctx, "assets.custody")}
                canAssign={can(ctx, "assets.assign")}
                canReport={can(ctx, "assets.faults.report")}
                solo={ctx.solo}
                openFault={open ? { id: open.id, type: open.type, doNotUse: open.doNotUse, note: open.note } : null}
                lostOpen={!!loss}
              />
            )}
          </div>
          {main && (
            <div className="flex flex-col gap-2">
              <a href={photoUrl(main, "original")} className="overflow-hidden rounded-xl bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(main)} alt={asset.name} className="max-h-96 w-full object-contain" />
              </a>
              {more.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {more.map((id) => (
                    <a key={id} href={photoUrl(id, "original")} className="overflow-hidden rounded-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl(id, "thumb")} alt="" className="size-20 object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          <Section title="Details" flush>
            <dl className="divide-y">
              {details
                .filter((detail) => detail.value)
                .map((detail) => (
                  <div key={detail.label} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4 sm:px-5">
                    <dt className="w-36 shrink-0 text-sm text-muted-foreground">{detail.label}</dt>
                    <dd className="min-w-0 font-medium break-words whitespace-pre-line">{detail.value}</dd>
                  </div>
                ))}
              {details.every((detail) => !detail.value) && <p className="px-4 py-3 text-muted-foreground sm:px-5">No details yet.</p>}
            </dl>
          </Section>
          {faults.length > 0 && (
            <Section title="Faults" flush>
              <div className="flex flex-col divide-y">
                {faults.map((fault) => (
                  <FaultCard key={fault.id} fault={json(fault)} canManage={can(ctx, "assets.faults.manage")} />
                ))}
              </div>
            </Section>
          )}
          <History moves={json<MoveJson[]>(moves)} />
        </Stack>
        <Section title="Tag" description="Scan it with the Scan button, or any phone camera, to open this asset.">
          <div className="flex items-center gap-4">
            {qr && <div className="paper size-32 shrink-0 rounded-lg bg-white p-2 [&_svg]:size-full" aria-label={`QR tag for Asset No. ${asset.number}`} role="img" dangerouslySetInnerHTML={{ __html: qr }} />}
            <div className="min-w-0">
              <p className="font-mono text-sm font-semibold tracking-wide break-all">{asset.tagCode}</p>
              <p className="text-sm text-muted-foreground">The code to type in when a camera won&apos;t read the sticker.</p>
            </div>
          </div>
        </Section>
      </div>
    </>
  );
}

const MOVE_WORDS: Record<MoveJson["move"], string> = { CHECK_OUT: "Checked out", RETURN: "Returned", TAKE_OVER: "Taken over", MOVE: "Moved" };

function History({ moves }: { moves: MoveJson[] }) {
  if (!moves.length) return null;
  return (
    <Section title="History" description="Every move: where it went, who did it, and when." flush>
      <ol className="divide-y">
        {moves.map((move) => (
          <li key={move.id} className="flex flex-col gap-0.5 px-4 py-3 sm:px-5">
            <span className="font-medium">
              {MOVE_WORDS[move.move]}: {move.holder.text}
            </span>
            <span className="text-sm text-muted-foreground">
              {[move.by, when(move.at), move.until ? `until ${when(move.until)}` : "now"].join(" · ")}
            </span>
            {move.note && <span className="text-sm whitespace-pre-line">{move.note}</span>}
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Home's "Needs attention": Do-not-use and other open faults, and lost or stolen gear (for whoever looks after faults). */
export const panels: BlockPanels = {
  "home.attention": async ({ ctx }) => {
    if (!ctx.companyId || !can(ctx, "assets.faults.manage")) return null;
    const { unsafe, faults, lost } = await attention(ctx.companyId);
    if (!unsafe && !faults && !lost.length) return null;
    return (
      <>
        {lost.map((entry) => (
          <AttentionRow
            key={entry.asset.id}
            title={`Asset No. ${entry.asset.number}, ${entry.asset.name}`}
            badge={entry.kind === "STOLEN" ? "Stolen" : "Lost"}
            tone="destructive"
            description="Reported missing. Mark it recovered when it turns up."
            href={`/assets/${entry.asset.id}`}
          />
        ))}
        {unsafe > 0 && <AttentionRow title={`${unsafe} asset${unsafe === 1 ? "" : "s"} marked Do not use`} badge="Do not use" tone="destructive" description="Unsafe gear waiting to be repaired or retired." href="/assets/faults" />}
        {faults > 0 && <AttentionRow title={`${faults} fault${faults === 1 ? "" : "s"} to sort out`} badge="Faults" tone="warning" description="Acknowledge them, send them for repair, or close them." href="/assets/faults" />}
      </>
    );
  },
};
