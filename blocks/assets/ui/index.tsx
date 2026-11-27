// Assets pages (docs/assets-block.md §1, "What part 4b built"), laid out
// like Docket's Fixtures.
//   /assets                      the list: cards by where the gear is, search, scan, categories, Due, Retired
//   /assets/<id>                 one asset: name and ⋯ menu; a summary line with the product and support
//                                links; where it is and its Actions; Details beside the brand, kit pieces
//                                and tag; then Inspections and servicing, Faults, Manuals and documents, History
//   /assets/<id>/file/<fileId>   a manual, certificate or photo shown inside Grid
//   /assets/faults               every open fault
//   /assets/categories           Settings › Asset categories (and Reminders, part 5)
// Panels: Needs attention (Soft look's home.attention, and a card in the
// Grid look's home.top), and the job page's Assets on site (job.top).

import type { ReactNode } from "react";
import { ChevronLeft, ExternalLink, LifeBuoy, Phone } from "lucide-react";
import { can, notFound, type RequestContext } from "@grid/core";
import { Alert, AttentionList, AttentionRow, PageViewer, Section, Stack, buttonVariants, cn, type BlockPages, type BlockPanels } from "@grid/ui";
import type { JobTopPanelProps } from "@grid/block-projects";
import { brandsById } from "@grid/block-materials";
import { getAsset, listAssets, listCategories } from "../service";
import { tagSvg } from "../stickers";
import { history } from "../custody";
import { faultsFor, openFaults, attention } from "../faults";
import { currentLoss } from "../lost";
import { dueCounts, serviceFor } from "../inspections";
import { documentsFor, partsFor } from "../kit";
import { viewFile } from "../viewer";
import { getReminderSettings, notSeenCount, onSite, stillGotIt } from "../seen";
import { localDay } from "../sighting";
import { warrantyState } from "../due";
import { ServiceCard, type ServiceJson } from "./ServiceCard";
import { FaultCard } from "./FaultCard";
import { FaultsList } from "./FaultsList";
import { RetireLost } from "./RetireLost";
import { CustodyActions } from "./CustodyActions";
import { AssetMenu } from "./AssetMenu";
import { Assets } from "./Assets";
import { BrandCard, type BrandJson } from "./BrandCard";
import { CategoryTile, CopyText } from "./CategoryTile";
import { Categories } from "./Categories";
import { DocumentsCard, type DocumentJson } from "./DocumentsCard";
import { KitCard, type PartJson } from "./KitCard";
import { TagCard } from "./TagCard";
import { ScanSeen, StillGotItRow } from "./Sightings";
import { Chip, type AssetJson, type CategoryJson, type MoveJson } from "./shared";
import { WARRANTY_TONE, dayText, fieldText, money, photoUrl, shortDay, statusWords, when } from "./format";

/** Dates → strings, the way they reach a client component anyway. */
const json = <T,>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

export const pages: BlockPages = {
  faults: async ({ ctx }) => {
    if (!can(ctx, "assets.faults.manage")) throw notFound("Page not found");
    return <FaultsList initial={json(await openFaults(ctx))} />;
  },
  categories: async ({ ctx }) => {
    if (!can(ctx, "assets.manage")) throw notFound("Page not found");
    const [categories, reminders] = await Promise.all([listCategories(ctx), getReminderSettings(ctx)]);
    return <Categories initial={json<CategoryJson[]>(categories)} reminders={reminders} />;
  },
  "": async ({ ctx, params: [first, second, third, extra] }) => {
    if (!can(ctx, "assets.view") || extra) throw notFound("Page not found");
    if (first && second === "file" && third) return <FilePage ctx={ctx} assetId={first} fileId={third} />;
    if (second) throw notFound("Page not found");
    if (first) return <AssetPage ctx={ctx} assetId={first} />;
    const [assets, categories] = await Promise.all([listAssets(ctx), listCategories(ctx)]);
    return <Assets initial={json<AssetJson[]>(assets)} categories={json<CategoryJson[]>(categories)} canManage={can(ctx, "assets.manage")} userId={ctx.userId} />;
  },
};

/** The round back button and the title, with the ⋯ menu on the right (Docket's PageTitle). */
function TitleRow({ back, backLabel, title, children }: { back: string; backLabel: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3 sm:mb-6">
      <a href={back} aria-label={backLabel} className="flex size-touch shrink-0 items-center justify-center rounded-full bg-card hover:bg-muted">
        <ChevronLeft className="size-5" />
      </a>
      <h1 className="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {children}
    </div>
  );
}

async function FilePage({ ctx, assetId, fileId }: { ctx: RequestContext; assetId: string; fileId: string }) {
  const file = await viewFile(ctx, assetId, fileId);
  return (
    <>
      <TitleRow back={`/assets/${assetId}#documents`} backLabel="Back to the asset" title={file.title} />
      {file.kind === "pdf" ? (
        <PageViewer title={file.title} pages={file.pages.map(([width, height], index) => ({ src: `/api/assets/${assetId}/files/${fileId}/pages/${file.level}/p${index + 1}.jpg`, width, height }))} />
      ) : file.kind === "image" ? (
        <PageViewer title={file.title} pages={[{ src: photoUrl(fileId, "display"), width: 0, height: 0 }]} />
      ) : (
        <Section>
          <p className="text-sm text-muted-foreground">Grid can&apos;t show this kind of file. Download it to open it.</p>
        </Section>
      )}
    </>
  );
}

/** A detail row; `copy` makes the value copy itself when tapped (model, serial, barcode). */
function Row({ label, value, copy, mono }: { label: string; value: ReactNode; copy?: boolean; mono?: boolean }) {
  return (
    <>
      <dt className="font-semibold text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-words", !value && "text-muted-foreground", mono && value && "font-mono text-[13px]")}>{value && copy && typeof value === "string" ? <CopyText value={value} label={label} /> : value || "—"}</dd>
    </>
  );
}

async function AssetPage({ ctx, assetId }: { ctx: RequestContext; assetId: string }) {
  const canManage = can(ctx, "assets.manage");
  const [{ asset, fields }, qr, categories, moves, faults, loss, service, parts, docs] = await Promise.all([
    getAsset(ctx, assetId),
    tagSvg(ctx, assetId),
    canManage ? listCategories(ctx) : Promise.resolve([]),
    history(ctx, assetId),
    faultsFor(ctx, assetId),
    currentLoss(ctx, assetId),
    serviceFor(ctx, assetId),
    partsFor(ctx, assetId),
    documentsFor(ctx, assetId),
  ]);
  const brand = asset.brandId ? ((await brandsById(ctx.companyId!, [asset.brandId])).get(asset.brandId) ?? null) : null;
  const open = faults.find((fault) => fault.open) ?? null;
  const unsafe = faults.find((fault) => fault.open && fault.doNotUse);
  const overdue = service.routines.filter((routine) => routine.mustPass && routine.due.tone === "overdue");
  const makeModel = [brand?.name ?? asset.make, asset.model].filter(Boolean).join(" ");
  const support = brand?.supportUrl ?? brand?.website ?? null;
  const [main, ...more] = asset.photoFileIds;
  const showKit = asset.partsEnabled || parts.length > 0;
  // Its own warranty here; the list card shows the soonest across its pieces too.
  const ownWarranty = warrantyState(asset.warrantyEndsOn);

  return (
    <>
      <ScanSeen assetId={asset.id} />
      <TitleRow back="/assets" backLabel="Back to assets" title={asset.name}>
        {canManage && <AssetMenu asset={json<AssetJson>(asset)} categories={json<CategoryJson[]>(categories)} parts={parts.map((part) => ({ id: part.id, name: part.name }))} />}
      </TitleRow>
      <Stack>
        {unsafe && (
          <div role="alert" className="rounded-xl bg-destructive p-4 text-destructive-foreground">
            <p className="text-lg font-bold">Do not use</p>
            <p>
              {unsafe.note ? `"${unsafe.note}". ` : ""}Reported by {unsafe.reportedBy}, {when(json<string>(unsafe.reportedAt))}.
            </p>
          </div>
        )}
        {overdue.length > 0 && !unsafe && (
          <div role="alert" className="rounded-xl bg-destructive p-4 text-destructive-foreground">
            <p className="text-lg font-bold">{overdue.map((routine) => routine.name).join(" and ")} overdue</p>
            <p>Due {overdue.map((routine) => dayText(routine.due.dueOn)).join(" and ")}. Don&apos;t use it until a pass is logged.</p>
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
        {asset.status === "RETIRED" && !loss && <Alert>Retired: it&apos;s off the list, with its history kept. Its tag still opens this page. Put it back in service from the ⋯ menu.</Alert>}

        {/* Summary: what it is, and the links people reach for (Docket's summary line) */}
        <div className="flex flex-wrap items-center gap-3">
          {main ? (
            <a href={photoUrl(main, "original")} aria-label="Open the photo">
              <CategoryTile icon={asset.categoryIcon} photoFileId={main} className="size-14" />
            </a>
          ) : (
            <CategoryTile icon={asset.categoryIcon} className="size-14" />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Make and model on top when known; otherwise the category goes there instead of appearing twice. */}
            <span className="font-bold">{makeModel || asset.category || "No category"}</span>
            <span className="text-sm font-medium text-muted-foreground">{[makeModel ? asset.category : null, `Asset No. ${asset.number}`].filter(Boolean).join(" · ")}</span>
          </div>
          {(asset.productUrl || support || brand?.supportPhone) && (
            <div className="flex w-full flex-wrap gap-2 lg:w-auto">
              {asset.productUrl && (
                <a href={asset.productUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants(), "rounded-full")}>
                  <ExternalLink /> Product page
                </a>
              )}
              {support && (
                <a href={support} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: asset.productUrl ? "outline" : "default" }), "rounded-full")}>
                  <LifeBuoy /> {brand!.name} support
                </a>
              )}
              {brand?.supportPhone && (
                <a href={`tel:${brand.supportPhone.replace(/\s/g, "")}`} className={cn(buttonVariants({ variant: "outline" }), "rounded-full")}>
                  <Phone /> {brand.supportPhone}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Where it is, and what you can do with it (Grid's own: check out, return, faults) */}
        <div className="flex flex-col gap-3 rounded-xl bg-card p-4 sm:p-5">
          <div>
            <p className="text-sm text-muted-foreground">Where it is</p>
            <p className="text-lg font-semibold">{asset.holder.userId === ctx.userId ? ["With you", asset.holder.place].filter(Boolean).join(" · ") : asset.holder.text}</p>
            {asset.holder.since && <p className="text-sm text-muted-foreground">Since {when(json<string>(asset.holder.since))}</p>}
            {asset.notSeenSince && (
              <p className="mt-1 text-sm font-semibold">
                Not seen since {shortDay(asset.notSeenSince)}. Scan its tag when you next see it, or report it lost.
              </p>
            )}
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

        <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-2">
          <Section title="Details">
            {more.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {asset.photoFileIds.map((id) => (
                  <a key={id} href={photoUrl(id, "original")} className="overflow-hidden rounded-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl(id, "thumb")} alt="" className="size-16 object-cover" />
                  </a>
                ))}
              </div>
            )}
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2.5 text-sm">
              <Row label="Asset No." value={String(asset.number)} />
              <Row label="Model" value={asset.model} copy mono />
              <Row label="Serial" value={asset.serial} copy mono />
              {fields.map((field) => {
                const value = fieldText(field, asset.fields[field.key]);
                return value ? <Row key={field.key} label={field.label} value={value} /> : null;
              })}
              {asset.supplier && <Row label="Where bought" value={asset.supplier} />}
              <Row label="Bought" value={dayText(asset.purchasedOn)} />
              <dt className="font-semibold text-muted-foreground">Warranty</dt>
              <dd>
                <Chip tone={WARRANTY_TONE[ownWarranty.tone]}>{ownWarranty.text}</Chip>
              </dd>
              <Row label="Price paid" value={money(asset.purchasePrice)} />
              <Row label="Replacement" value={money(asset.replacementValue)} />
              {asset.barcode && <Row label="Barcode" value={asset.barcode} copy mono />}
            </dl>
            {asset.notes && <p className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm whitespace-pre-line">{asset.notes}</p>}
          </Section>

          <Stack>
            {brand && <BrandCard brand={json<BrandJson>(brand)} canEdit={can(ctx, "materials.manage")} />}
            {showKit && <KitCard assetId={asset.id} assetMake={asset.make} parts={json<PartJson[]>(parts)} canManage={canManage} />}
            <TagCard assetId={asset.id} number={asset.number} tagCode={asset.tagCode} qr={qr} canPrint={canManage} />
          </Stack>
        </div>

        {(service.enabled || service.routines.length > 0 || service.checks.length > 0) && (
          <ServiceCard assetId={asset.id} assetName={asset.name} data={json<ServiceJson>(service)} canManage={canManage} canRecord={can(ctx, "assets.inspections.record")} />
        )}
        {faults.length > 0 && (
          <Section title="Faults" flush>
            <div className="flex flex-col divide-y">
              {faults.map((fault) => (
                <FaultCard key={fault.id} fault={json(fault)} canManage={can(ctx, "assets.faults.manage")} />
              ))}
            </div>
          </Section>
        )}
        <DocumentsCard
          assetId={asset.id}
          assetName={asset.name}
          documents={json<DocumentJson[]>(docs.documents)}
          pieces={parts.map((part) => ({ id: part.id, name: part.name }))}
          copies={docs.copies}
          canManage={canManage}
        />
        <History moves={json<MoveJson[]>(moves)} />
      </Stack>
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
            <span className="text-sm text-muted-foreground">{[move.by, when(move.at), move.until ? `until ${when(move.until)}` : "now"].join(" · ")}</span>
            {move.note && <span className="text-sm whitespace-pre-line">{move.note}</span>}
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Home's "Needs attention": Do-not-use and other open faults, lost or stolen gear, and tests overdue or coming up (for whoever looks after faults). */
/** The rows Needs attention gets from Assets: lost, Do not use, overdue and coming up, faults and not seen
 * for whoever looks after the gear; "Do you still have it?" for whoever has it. */
async function attentionRows(ctx: RequestContext) {
  if (!ctx.companyId) return null;
  const manages = can(ctx, "assets.faults.manage");
  const [managed, due, notSeen, mine] = await Promise.all([
    manages ? attention(ctx.companyId) : Promise.resolve(null),
    manages ? dueCounts(ctx.companyId) : Promise.resolve(null),
    manages ? notSeenCount(ctx.companyId) : Promise.resolve(0),
    can(ctx, "assets.custody") ? stillGotIt(ctx) : Promise.resolve([]),
  ]);
  const anything = mine.length > 0 || notSeen > 0 || (managed && (managed.unsafe || managed.faults || managed.lost.length)) || (due && (due.overdue || due.soon));
  if (!anything) return null;
  return (
    <>
      {managed?.lost.map((entry) => (
        <AttentionRow
          key={entry.asset.id}
          title={`Asset No. ${entry.asset.number}, ${entry.asset.name}`}
          badge={entry.kind === "STOLEN" ? "Stolen" : "Lost"}
          tone="destructive"
          description="Reported missing. Mark it recovered when it turns up."
          href={`/assets/${entry.asset.id}`}
        />
      ))}
      {!!managed?.unsafe && <AttentionRow title={`${managed.unsafe} asset${managed.unsafe === 1 ? "" : "s"} marked Do not use`} badge="Do not use" tone="destructive" description="Unsafe gear waiting to be repaired or retired." href="/assets/faults" />}
      {!!due?.overdue && (
        <AttentionRow
          title={`${due.overdue} asset${due.overdue === 1 ? "" : "s"} overdue for a test`}
          badge="Overdue"
          tone="destructive"
          description="Test & tag or an inspection they must pass. They can't be checked out until a pass is logged."
          href="/assets?show=due"
        />
      )}
      {mine.map((entry) => (
        <StillGotItRow key={entry.assetId} assetId={entry.assetId} title={`Asset No. ${entry.number}, ${entry.name}`} where={entry.where} howLong={entry.howLong} />
      ))}
      {!!due?.soon && <AttentionRow title={`${due.soon} test${due.soon === 1 ? "" : "s"} due in the next 2 weeks`} badge="Coming up" tone="warning" description="Book them in, or log them once they're done." href="/assets?show=due" />}
      {!!managed?.faults && <AttentionRow title={`${managed.faults} fault${managed.faults === 1 ? "" : "s"} to sort out`} badge="Faults" tone="warning" description="Acknowledge them, send them for repair, or close them." href="/assets/faults" />}
      {notSeen > 0 && (
        <AttentionRow
          title={`${notSeen} asset${notSeen === 1 ? "" : "s"} not seen lately`}
          badge="Not seen"
          tone="warning"
          description="Nothing has moved or scanned them for a while. Scan them when you see them, or report them lost."
          href="/assets?show=notseen"
        />
      )}
    </>
  );
}

export const panels: BlockPanels = {
  // Soft look: rows in Home's Needs attention list.
  "home.attention": async ({ ctx }) => attentionRows(ctx),
  // Grid look: the same rows as a card at the top of Home. (home.top isn't shown in the Soft look.)
  "home.top": async ({ ctx }) => {
    const rows = await attentionRows(ctx);
    return rows ? <AttentionList subtitle="Tools and gear">{rows}</AttentionList> : null;
  },
  // The job page: gear left on the job, or with someone who took it there.
  "job.top": async (props) => {
    const { ctx, job } = props as typeof props & JobTopPanelProps;
    if (!can(ctx, "assets.view") || job.status === "QUOTING" || job.status === "NOT_WON") return null;
    const gear = await onSite(ctx, job.id);
    // Nothing here: say nothing, so the job page stays short.
    if (!gear.length) return null;
    return (
      <Section title="Assets on site" description={`${gear.length} thing${gear.length === 1 ? "" : "s"} from the workshop on this job.`} flush>
        <ul className="divide-y">
          {gear.map((entry) => (
            <li key={entry.assetId}>
              <a href={`/assets/${entry.assetId}`} className="flex min-h-touch-lg items-center gap-3 px-4 py-3 hover:bg-muted sm:px-6">
                <CategoryTile icon={entry.categoryIcon} photoFileId={entry.photoFileId} className="size-10" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{entry.name}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {[`No. ${entry.number}`, entry.who, entry.since ? `since ${shortDay(localDay(entry.since))}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {entry.status !== "IN_SERVICE" && <Chip tone={entry.status === "FAULTY" ? "soon" : "overdue"}>{statusWords(entry.status as AssetJson["status"])}</Chip>}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    );
  },
};
