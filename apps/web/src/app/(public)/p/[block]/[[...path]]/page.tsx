// Public block pages at /p/<blockId>/<page>/<params...> (short addresses
// like /q/<token> and /verify/<code> are rewrites to here, next.config.ts).
// No sign-in: the block checks the token or code itself.
import { notFound } from "next/navigation";
import { isHttpError } from "@grid/core";
import { blockPublicPages } from "@/blocks";

type Props = { params: Promise<{ block: string; path?: string[] }> };

export default async function PublicBlockPage({ params }: Props) {
  const { block: blockId, path = [] } = await params;
  const load = blockPublicPages[blockId];
  if (!load) notFound();
  const pages = await load();
  for (let index = path.length; index >= 0; index--) {
    const page = pages[path.slice(0, index).join("/")];
    if (!page) continue;
    try {
      return await page({ params: path.slice(index) });
    } catch (error) {
      if (isHttpError(error) && error.status === 404) notFound();
      throw error;
    }
  }
  notFound();
}
