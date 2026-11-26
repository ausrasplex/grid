// Public API for blocks that depend on "clients" (projects, quotes).
/**
 * Props for the "client.page" panel slot: things other Blocks have with
 * this client, on /clients/<id> (projects: active jobs; quotes: open quotes).
 * On a business's page (/clients/business/<id>) the same panels show what
 * everyone at the business has: `clientIds` is all of them.
 */
export interface ClientPagePanelProps {
  clientId: string;
  clientName: string;
  /** Whose jobs and quotes to show: just this client, or everyone at a business. */
  clientIds: string[];
}

export { listClients, getClient, requireClient, clientsById, clientIdsNamed, type ClientRow, type ClientRenamedEvent } from "./service";
export { clientLabel, roleLine, quoteDetails, type BusinessDetails } from "./people";
export { setClientPicture, canSeeClientPicture, type PictureOwner } from "./pictures";
