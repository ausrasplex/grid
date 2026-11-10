import { type BlockPages } from "@grid/ui";
import { can } from "@grid/core";
import { getTheme } from "../service";
import { Branding } from "./Branding";

export const pages: BlockPages = {
  branding: async ({ ctx }) => {
    if (!can(ctx, "templates.theme.manage")) return <p>Only the Owner can change branding.</p>;
    return <Branding initial={await getTheme(ctx)} />;
  },
};
