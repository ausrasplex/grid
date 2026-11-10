// Quotes pages and the panel it puts on job pages.
//   /b/quotes                 list
//   /b/quotes/new[/<job>]     start a quote (optionally for an existing job)
//   /b/quotes/<id>            the quote: editor while draft, outcome once sent
//   /b/quotes/price-book      labour and materials
//   /b/quotes/clients         clients
//   /b/quotes/settings        tax & currency
//   /q/<token>                the customer's page (public; rewrites to /p/quotes/q/<token>)
//   panel "job.area"          "Quote Q-1001 · $4,180" link on the job it became

import { headers } from "next/headers";
import { app, can } from "@grid/core";
import { type BlockPages, type BlockPanels, type PublicPages } from "@grid/ui";
import { getProject, type JobAreaPanelProps } from "@grid/block-projects";
import { getQuote, getTaxSettings, listClients, listPriceItems, listQuotes, quoteForJob } from "../service";
import { Clients } from "./Clients";
import { CustomerQuote, type CustomerViewJson } from "./CustomerQuote";
import type { ClientJson } from "./ClientPicker";
import { NewQuote } from "./NewQuote";
import { PriceBook, type PriceItemRow } from "./PriceBook";
import { QuoteEditor, type QuoteJson } from "./QuoteEditor";
import { QuotesList, type QuoteRowJson } from "./QuotesList";
import { StatusBadge } from "./StatusBadge";
import { TaxSettingsForm, type TaxSettingsJson } from "./TaxSettingsForm";

/** Dates → strings, the way they reach a client component anyway. */
const json = <T,>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

export const pages: BlockPages = {
  "": async ({ ctx, params: [id] }) => {
    if (id) {
      const [quote, emailReady] = await Promise.all([getQuote(ctx, id), app().mail.configured()]);
      return <QuoteEditor key={quote.id} initial={json<QuoteJson>(quote)} permissions={{ edit: can(ctx, "quotes.create"), send: can(ctx, "quotes.send") }} emailReady={emailReady} />;
    }
    const [rows, settings] = await Promise.all([listQuotes(ctx), getTaxSettings(ctx)]);
    return <QuotesList initial={json<QuoteRowJson[]>(rows)} currency={settings.currency} locale={settings.locale} canCreate={can(ctx, "quotes.create")} />;
  },

  new: async ({ ctx, params: [jobId] }) => {
    if (!can(ctx, "quotes.create")) return <p>You can&apos;t write quotes.</p>;
    const job = jobId ? await getProject(ctx, jobId) : null;
    return <NewQuote job={job && { id: job.id, name: job.name, address: job.site.address ?? "", clientName: job.clientName }} />;
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

  clients: async ({ ctx }) => (
    <Clients initial={json<ClientJson[]>(await listClients(ctx))} canManage={can(ctx, "quotes.clients.manage")} canAdd={can(ctx, "quotes.create")} />
  ),

  settings: async ({ ctx }) => {
    if (!can(ctx, "quotes.settings.manage")) return <p>Only the Owner can change tax and currency.</p>;
    return <TaxSettingsForm initial={json<TaxSettingsJson>(await getTaxSettings(ctx))} />;
  },
};

export const panels: BlockPanels = {
  // On the job page: the quote it came from (shown once, not per area).
  "job.area": async (props) => {
    const { ctx, job } = props as typeof props & JobAreaPanelProps;
    if (!can(ctx, "quotes.view")) return null;
    const quote = await quoteForJob(ctx, job.id);
    if (!quote) return null;
    return (
      <a href={`/b/quotes/${quote.id}`} className="flex min-h-touch items-center gap-3 rounded-xl border bg-card px-4 py-3 hover:bg-muted">
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
