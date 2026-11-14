// Clients pages.
//   /clients     the list: add, change or remove clients (Settings › Clients)

import { can } from "@grid/core";
import { type BlockPages } from "@grid/ui";
import { listClients } from "../service";
import { Clients } from "./Clients";

export const pages: BlockPages = {
  "": async ({ ctx }) => <Clients initial={await listClients(ctx)} canManage={can(ctx, "clients.manage")} canAdd={can(ctx, "clients.add")} />,
};
