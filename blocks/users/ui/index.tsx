import { PageHeader, type BlockPages } from "@grid/ui";
import { ProfileForm, ShareMyContact } from "./ProfileForm";

export const pages: BlockPages = {
  // Share my contact needs a business to put on the card.
  profile: ({ ctx }) => (
    <>
      <PageHeader title="Profile" actions={ctx.companyId ? <ShareMyContact /> : undefined} />
      <ProfileForm />
    </>
  ),
};
