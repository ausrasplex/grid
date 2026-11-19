// Sign-offs panels.
//   slot "documents.sheet"   the sign-off column, progress and menu in the spreadsheet viewer

import { can, isHttpError } from "@grid/core";
import type { BlockPanels, SheetViewerPanelProps } from "@grid/ui";
import { documentSignoffs, me } from "../service";
import { SignoffLayer, type SignoffsJson } from "./SignoffLayer";

const json = <T,>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

export const panels: BlockPanels = {
  "documents.sheet": async (props) => {
    const { ctx, document } = props as typeof props & SheetViewerPanelProps;
    if (!can(ctx, "signoffs.view")) return null;
    const signoffs = await documentSignoffs(ctx, document.id).catch((error: unknown) => {
      // Not a spreadsheet after all, or gone: no sign-offs to show.
      if (isHttpError(error)) return null;
      throw error;
    });
    if (!signoffs) return null;
    return (
      <SignoffLayer
        documentId={document.id}
        initial={json<SignoffsJson>(signoffs)}
        me={await me(ctx)}
        permissions={{ sign: can(ctx, "signoffs.sign"), manage: can(ctx, "signoffs.manage") }}
        canDownload={signoffs.canDownload}
      />
    );
  },
};
