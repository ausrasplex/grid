// My tickets & licences pages, and the card it puts on Home.
//   /tickets          your tickets and licences
//   panel "home.top"  "1 ticket expired · 2 expiring soon" when any are

import { AttentionRow, HomeTile, Icon, type BlockPages, type BlockPanels } from "@grid/ui";
import { myTickets, ticketAlerts } from "../service";
import { expiryWords } from "../types";
import { Tickets, type TicketJson } from "./Tickets";

export const pages: BlockPages = {
  "": async ({ ctx }) => <Tickets initial={(await myTickets(ctx)) as TicketJson[]} />,
};

export const panels: BlockPanels = {
  // Home (Soft look): your tickets at a glance.
  "home.tiles": async ({ ctx }) => {
    const tickets = await myTickets(ctx);
    const expired = tickets.filter((ticket) => ticket.status === "expired").length;
    const soon = tickets.filter((ticket) => ticket.status === "soon").length;
    const value = !tickets.length ? "None yet" : expired ? `${expired} expired` : soon ? `${soon} expiring` : "All current";
    return (
      <HomeTile
        label="Tickets & licences"
        value={value}
        foot={tickets.length ? `${tickets.length} saved` : "Add your white card and licence"}
        progress={tickets.length ? (tickets.length - expired - soon) / tickets.length : 0}
        href="/tickets"
      />
    );
  },
  // Home (Soft look): each ticket that's run out or is about to.
  "home.attention": async ({ ctx }) => {
    const due = (await myTickets(ctx)).filter((ticket) => ticket.status === "expired" || ticket.status === "soon");
    if (!due.length) return null;
    return (
      <>
        {due.map((ticket) => (
          <AttentionRow
            key={ticket.id}
            title={ticket.title}
            badge={ticket.status === "expired" ? "Expired" : "Renew"}
            tone={ticket.status === "expired" ? "destructive" : "warning"}
            description={`${expiryWords(ticket.daysLeft)}. Renew it, then update it in Grid.`}
            href="/tickets"
          />
        ))}
      </>
    );
  },
  "home.top": async ({ ctx }) => {
    const { expired, soon } = await ticketAlerts(ctx);
    if (!expired && !soon) return null;
    const words = [expired ? `${expired} expired` : null, soon ? `${soon} expiring soon` : null].filter(Boolean).join(" · ");
    return (
      <a href="/tickets" className={`flex min-h-touch items-center gap-3 rounded-xl px-4 py-3 hover:opacity-90 ${expired ? "bg-destructive/15" : "bg-warning/15"}`}>
        <Icon name="ticket" className="size-6 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{expired ? "A ticket or licence has run out" : "Tickets or licences expiring soon"}</span>
          <span className="block text-sm text-muted-foreground">{words}. Renew, then update it in Grid.</span>
        </span>
        <Icon name="chevron-right" className="size-5 shrink-0 text-muted-foreground" />
      </a>
    );
  },
};
