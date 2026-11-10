import { redirect } from "next/navigation";
import { can } from "@grid/core";
import { type BlockPages } from "@grid/ui";
import { getSite } from "../service";
import { NewSiteForm } from "./NewSiteForm";
import { SitesList } from "./SitesList";
import { StructureEditor } from "./StructureEditor";

export const pages: BlockPages = {
  // /b/sites                    the Sites list
  // /b/sites/<id>               → the site page (projects block)
  // /b/sites/<id>/structure     buildings and levels
  "": async ({ ctx, params: [siteId, sub] }) => {
    if (!siteId) {
      return <SitesList solo={ctx.solo} canCreateJob={can(ctx, "projects.create")} canCreateSite={can(ctx, "sites.create")} />;
    }
    if (sub === "structure") {
      const site = await getSite(ctx, siteId);
      return <StructureEditor initial={site} canEdit={can(ctx, "sites.structure.edit")} />;
    }
    redirect(`/b/projects/site/${siteId}`);
  },
  new: () => <NewSiteForm />,
};
