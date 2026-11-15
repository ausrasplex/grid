// Quotes pages and the panel it puts on job pages.
//   /quotes                 list
//   /quotes/new[/<job>]     start a quote (optionally for an existing job)
//   /quotes/<id>            the quote: editor while draft, outcome once sent
//   /quotes/price-book      labour and materials
//   /quotes/clients         → /clients (one list for jobs and quotes)
//   /quotes/settings        tax & currency
//   /q/<token>                the customer's page (public; rewrites to /p/quotes/q/<token>)
//   panel "job.area"          "Quote Q-1001 · $4,180" link on the job it became

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { app, can } from "@grid/core";
import { AttentionRow, Badge, HomeTile, Icon, List, Section, buttonVariants, cn, type BlockPages, type BlockPanels, type PublicPages } from "@grid/ui";
import { getProject, type JobAreaPanelProps, type PlaceStartPanelProps } from "@grid/block-projects";
import { getSite } from "@grid/block-sites";
import type { PlaceSite } from "@grid/block-sites/components";
import { getClient, type ClientPagePanelProps } from "@grid/block-clients";
import { formatMoney } from "../money";
import { getQuote, getTaxSettings, listPriceItems, listQuotes, quoteForJob } from "../service";
import { CustomerQuote, type CustomerViewJson } from "./CustomerQuote";
import { NewQuote } from "./NewQuote";
import { PriceBook, type PriceItemRow } from "./PriceBook";
import { QuoteEditor, type QuoteJson } from "./QuoteEditor";
import { QuotesList, type QuoteRowJson } from "./QuotesList";
import { StatusBadge } from "./StatusBadge";
import { TaxSettingsForm, type TaxSettingsJson } from "./TaxSettingsForm";
import { UploadQuote } from "./UploadQuote";
import { UploadedQuote, type UploadedQuoteJson } from "./UploadedQuote";

/** Dates → strings, the way they reach a client component anyway. */
const json = <T,>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

export const pages: BlockPages = {
  "": async ({ ctx, params: [id] }) => {
    if (id) {
      const [quote, emailReady] = await Promise.all([getQuote(ctx, id), app().mail.configured()]);
      // Made outside Grid: the PDF and its answer, no editor.
      if (quote.uploaded) return <UploadedQuote quote={json<UploadedQuoteJson>(quote)} canAnswer={can(ctx, "quotes.send")} />;
      return <QuoteEditor key={quote.id} initial={json<QuoteJson>(quote)} permissions={{ edit: can(ctx, "quotes.create"), send: can(ctx, "quotes.send") }} emailReady={emailReady} />;
    }
    const [rows, settings] = await Promise.all([listQuotes(ctx), getTaxSettings(ctx)]);
    return <QuotesList initial={json<QuoteRowJson[]>(rows)} currency={settings.currency} locale={settings.locale} canCreate={can(ctx, "quotes.create")} />;
  },

  // /quotes/new, /quotes/new/<job>, or /quotes/new/at/<site>/<building>[/<level>] (from an empty building or floor).
  new: async ({ ctx, params }) => {
    if (!can(ctx, "quotes.create")) return <p>You can&apos;t write quotes.</p>;
    if (params[0] === "at" && params[1]) {
      const [, siteId, buildingId, levelId] = params;
      const site = json<PlaceSite>(await getSite(ctx, siteId!));
      const building = site.buildings.find((candidate) => candidate.id === buildingId);
      const level = building?.levels.find((candidate) => candidate.id === levelId);
      return (
        <NewQuote
          job={null}
          place={{ site, buildingId: building?.id ?? null, levelId: level?.id ?? null }}
          client={null}
          canAddClient={can(ctx, "clients.add")}
          canPickSite={can(ctx, "sites.view")}
        />
      );
    }
    const jobId = params[0];
    const job = jobId ? await getProject(ctx, jobId) : null;
    // Start with the job's client.
    const client = job?.clientId && can(ctx, "clients.view") ? await getClient(ctx, job.clientId) : null;
    return <NewQuote job={job && { id: job.id, name: job.name, address: job.site.address ?? "" }} client={client} canAddClient={can(ctx, "clients.add")} canPickSite={can(ctx, "sites.view")} />;
  },

  // /quotes/upload, or /quotes/upload/<job> ("Attach a quote PDF" on a job without a quote).
  upload: async ({ ctx, params: [jobId] }) => {
    if (!can(ctx, "quotes.create")) return <p>You can&apos;t add quotes.</p>;
    const job = jobId ? await getProject(ctx, jobId) : null;
    const client = job?.clientId && can(ctx, "clients.view") ? await getClient(ctx, job.clientId) : null;
    return <UploadQuote job={job && { id: job.id, name: job.name, address: job.site.address ?? "" }} client={client} canAddClient={can(ctx, "clients.add")} canPickSite={can(ctx, "sites.view")} />;
  },

  "price-book": async ({ ctx }) => {
    const [items, settings] = await Promise.all([listPriceItems(ctx), getTaxSettings(ctx)]);
    return (
      <PriceBook
        initial={json<PriceItemRow[]>(items)}
        codes={settings.codes}
        defaultTaxCodeId={settings.defaultTaxCodeId}
        taxName={settings.taxName}
        currency={settings.currency}
        locale={settings.locale}
        canManage={can(ctx, "quotes.pricebook.manage")}
        canSeeCosts={can(ctx, "quotes.costs.view")}
      />
    );
  },

  clients: async () => redirect("/clients"),

  settings: async ({ ctx }) => {
    if (!can(ctx, "quotes.settings.manage")) return <p>Only the Owner can change tax and currency.</p>;
    return <TaxSettingsForm initial={json<TaxSettingsJson>(await getTaxSettings(ctx))} />;
  },
};

export const panels: BlockPanels = {
  // Home (Soft look): what's waiting for an answer.
  "home.tiles": async ({ ctx }) => {
    if (!can(ctx, "quotes.view")) return null;
    const [rows, settings] = await Promise.all([listQuotes(ctx, { tab: "open" }), getTaxSettings(ctx)]);
    const sent = rows.filter((row) => row.status === "SENT");
    const total = sent.reduce((sum, row) => sum + row.totalCents, 0);
    const drafts = rows.length - sent.length;
    return (
      <HomeTile
        label="Quotes out"
        value={formatMoney(total, settings.currency, settings.locale).replace(/\.00$/, "")}
        foot={rows.length ? [`${sent.length} waiting for an answer`, drafts ? `${drafts} draft${drafts === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") : "No open quotes"}
        progress={rows.length ? sent.length / rows.length : 0}
        href="/quotes"
      />
    );
  },
  // Home (Soft look): sent quotes past their valid date.
  "home.attention": async ({ ctx }) => {
    if (!can(ctx, "quotes.view")) return null;
    const rows = (await listQuotes(ctx, { tab: "sent" })).filter((row) => row.validUntil < new Date());
    if (!rows.length) return null;
    return (
      <>
        {rows.slice(0, 5).map((row) => (
          <AttentionRow
            key={row.id}
            title={`${row.number} is past its valid date`}
            badge="Follow up"
            tone="warning"
            description={[row.title, row.clientName, `valid until ${row.validUntil.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`].filter(Boolean).join(" · ")}
            href={`/quotes/${row.id}`}
          />
        ))}
      </>
    );
  },
  // On a client's page: quotes waiting on them (drafts and sent).
  "client.page": async (props) => {
    const { ctx, clientId } = props as typeof props & ClientPagePanelProps;
    if (!can(ctx, "quotes.view")) return null;
    const [rows, settings] = await Promise.all([listQuotes(ctx, { tab: "open", clientId }), getTaxSettings(ctx)]);
    if (!rows.length) return null;
    const money = (cents: number) => formatMoney(cents, settings.currency, settings.locale);
    const waiting = rows.reduce((total, row) => total + row.totalCents, 0);
    return (
      <Section title={`Open quotes (${rows.length})`} description={`${money(waiting)} waiting for an answer`} flush>
        <List>
          {rows.map((row) => (
            <li key={row.id}>
              <a href={`/quotes/${row.id}`} className="flex min-h-touch-lg items-center gap-3 px-4 py-2.5 hover:bg-muted active:bg-muted sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold">{row.title}</span>
                    <StatusBadge status={row.status} viewed={!!row.viewedAt} />
                    {row.status === "SENT" && row.validUntil < new Date() && <Badge variant="warning">Past valid date</Badge>}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">{[row.number, row.uploaded ? "PDF" : null, row.siteAddress].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{money(row.totalCents)}</span>
              </a>
            </li>
          ))}
        </List>
      </Section>
    );
  },
  // On an empty building or floor: "Add quote", with the place filled in.
  "place.start": async (props) => {
    const { ctx, siteId, buildingId, levelId } = props as typeof props & PlaceStartPanelProps;
    if (!can(ctx, "quotes.create")) return null;
    return (
      <a href={`/quotes/new/at/${siteId}/${buildingId}${levelId ? `/${levelId}` : ""}`} className={cn(buttonVariants({ size: "lg", variant: "outline" }), "w-full sm:w-auto")}>
        <Icon name="dollar" /> Add quote
      </a>
    );
  },
  // On the job page: the quote it came from (shown once, not per area).
  "job.area": async (props) => {
    const { ctx, job } = props as typeof props & JobAreaPanelProps;
    if (!can(ctx, "quotes.view")) return null;
    const quote = await quoteForJob(ctx, job.id);
    // No quote yet: one made outside Grid can be attached.
    if (!quote) {
      if (!can(ctx, "quotes.create")) return null;
      return (
        <a href={`/quotes/upload/${job.id}`} className="flex min-h-touch items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-muted-foreground hover:bg-muted">
          <Icon name="file" className="size-5" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-foreground">Attach a quote PDF</span>
            <span className="block text-sm">For a quote you made outside Grid</span>
          </span>
        </a>
      );
    }
    return (
      <a href={`/quotes/${quote.id}`} className="flex min-h-touch items-center gap-3 rounded-xl border bg-card px-4 py-3 hover:bg-muted">
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-muted-foreground">Quote</span>
          <span className="flex items-center gap-2 font-semibold">
            {quote.number} <StatusBadge status={quote.status} />
          </span>
        </span>
        <span className="font-semibold tabular-nums">{quote.total}</span>
      </a>
    );
  },
};

export const publicPages: PublicPages = {
  q: async ({ params: [token] }) => {
    const { customerView } = await import("../public");
    const requestHeaders = await headers();
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown";
    const view = await customerView(token ?? "", { ip, userAgent: (requestHeaders.get("user-agent") ?? "").slice(0, 400) });
    return <CustomerQuote view={json<CustomerViewJson>(view)} />;
  },
};
