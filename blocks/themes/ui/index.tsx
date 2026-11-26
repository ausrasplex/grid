// Themes pages.
//   /themes           yours and the business's
//   /themes/new       make one (?from=soft to start from Soft, ?for=business)
//   /themes/<id>      change one, or look at one you can't change
import { Suspense } from "react";
import { Loading, type BlockPages } from "@grid/ui";
import { Themes } from "./Themes";
import { EditTheme, NewTheme } from "./ThemeEditor";

export const pages: BlockPages = {
  "": ({ ctx, params }) => {
    const [id] = params;
    if (id === "new") {
      return (
        <Suspense fallback={<Loading rows={5} />}>
          <NewTheme />
        </Suspense>
      );
    }
    if (id) return <EditTheme id={id} />;
    return <Themes companyName={(ctx as { company?: { name: string } | null }).company?.name ?? null} />;
  },
};
