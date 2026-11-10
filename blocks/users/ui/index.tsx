import { PageHeader, type BlockPages } from "@grid/ui";
import { ProfileForm } from "./ProfileForm";

export const pages: BlockPages = {
  profile: () => (
    <>
      <PageHeader title="Profile" subtitle="How you appear to your company and on every project." />
      <ProfileForm />
    </>
  ),
};
