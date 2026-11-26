// Assets pages (docs/assets-block.md §1).
//   /assets              the list: search, scan, categories, retired, Select → Print tags
//   /assets/<id>         one asset: where it is and its Actions, photos, details, its fields, the QR tag, its history
//   /assets/categories   Settings › Asset categories (and each one's fields)

import { can, notFound, type RequestContext } from "@grid/core";
import { Alert, PageHeader, Section, Stack, type BlockPages } from "@grid/ui";
import { getAsset, listAssets, listCategories } from "../service";
import { tagSvg } from "../stickers";
import { history } from "../custody";
import { CustodyActions } from "./CustodyActions";
import { AssetActions } from "./AssetActions";
import { Assets } from "./Assets";
import { Categories } from "./Categories";
import { assetMeta, fieldText, photoUrl, statusWords, when, type AssetJson, type CategoryJson, type MoveJson } from "./shared";

/** Dates → strings, the way they reach a client component anyway. */
const json = <T,>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

export const pages: BlockPages = {
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
          {asset.status === "RETIRED" && <Alert>Retired: it&apos;s off the list, with its history kept. Its tag still opens this page.</Alert>}
          <div className="flex flex-col gap-3 rounded-xl bg-card p-4 sm:p-5">
            <div>
              <p className="text-sm text-muted-foreground">Where it is</p>
              <p className="text-lg font-semibold">{asset.holder.userId === ctx.userId ? ["With you", asset.holder.place].filter(Boolean).join(" · ") : asset.holder.text}</p>
              {asset.holder.since && <p className="text-sm text-muted-foreground">Since {when(json<string>(asset.holder.since))}</p>}
            </div>
            {can(ctx, "assets.custody") && <CustodyActions asset={json<AssetJson>(asset)} userId={ctx.userId} canAssign={can(ctx, "assets.assign")} solo={ctx.solo} />}
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
