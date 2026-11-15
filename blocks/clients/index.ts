// Public API for blocks that depend on "clients" (projects, quotes).
/**
 * Props for the "client.page" panel slot: things other Blocks have with
 * this client, on /clients/<id> (projects: active jobs; quotes: open quotes).
 */
export interface ClientPagePanelProps {
  clientId: string;
  clientName: string;
}

export { listClients, getClient, requireClient, clientsById, clientIdsNamed, type ClientRow, type ClientRenamedEvent } from "./service";
