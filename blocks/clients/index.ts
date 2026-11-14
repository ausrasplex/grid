// Public API for blocks that depend on "clients" (projects, quotes).
export { listClients, getClient, requireClient, clientsById, clientIdsNamed, type ClientRow, type ClientRenamedEvent } from "./service";
