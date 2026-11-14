// My tickets & licences pages, and the card it puts on Home.
//   /tickets          your tickets and licences
//   panel "home.top"  "1 ticket expired · 2 expiring soon" when any are

import { Icon, type BlockPages, type BlockPanels } from "@grid/ui";
import { myTickets, ticketAlerts } from "../service";
import { Tickets, type TicketJson } from "./Tickets";

export const pages: BlockPages = {
  "": async ({ ctx }) => <Tickets initial={(await myTickets(ctx)) as TicketJson[]} />,
};

export const panels: BlockPanels = {
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
