// Public pages of the signatures block.
//   /verify, /verify/<code>   (rewrites to /p/signatures/verify/...)
import type { PublicPages } from "@grid/ui";
import { lookupVerifyCode } from "../service";
import { Verify } from "./Verify";

export const publicPages: PublicPages = {
  verify: async ({ params: [code] }) => {
    const lookup = code ? await lookupVerifyCode(decodeURIComponent(code)) : null;
    return <Verify initialCode={lookup?.code ?? ""} lookup={lookup ? JSON.parse(JSON.stringify(lookup)) : null} />;
  },
};
