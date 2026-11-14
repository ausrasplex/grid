// Renders block pages at /<address>/<page>/<params...>: the block's address
// (its id, or a chosen word like "jobs") then the page. The app's own pages
// (/settings, /scan, ...) win over this; RESERVED_ADDRESSES keeps blocks off them.
// A block's page only renders when the block is on for the active company.
import { notFound } from "next/navigation";
import { isHttpError } from "@grid/core";
import { Alert } from "@grid/ui";
import { getContext } from "@/lib/context";
import { blockPages, registry, renderPanels } from "@/blocks";

type Props = { params: Promise<{ block: string; path?: string[] }> };

export default async function BlockPage({ params }: Props) {
  const { block: address, path = [] } = await params;
  const ctx = (await getContext())!;

  const definition = registry.atAddress(address);
  const blockId = definition?.id ?? "";
  const load = blockPages[blockId];
  if (!definition || !load) notFound();

  if (!definition.required && !ctx.enabledBlocks.has(blockId)) {
    return <Alert>The {definition.name} block is switched off for this company.</Alert>;
  }

  const pages = await load();
  // Longest matching page key wins: "members/abc" tries "members/abc", then "members", then "".
  for (let index = path.length; index >= 0; index--) {
    const page = pages[path.slice(0, index).join("/")];
    if (!page) continue;
    try {
      return await page({ ctx, params: path.slice(index), panels: (slot, props) => renderPanels(ctx, slot, props) });
    } catch (error) {
      // Services throw HttpErrors; turn them into the right page.
      // Anything else (including Next's redirect/notFound signals) passes through.
      if (!(isHttpError(error))) throw error;
      if (error.status === 404) notFound();
      return <Alert variant="error">{error.message}</Alert>;
    }
  }
  notFound();
}
