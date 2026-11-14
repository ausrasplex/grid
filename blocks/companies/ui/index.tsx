import { can } from "@grid/core";
import { Alert, PageHeader, type BlockPages } from "@grid/ui";
import { CompanySwitcher } from "./CompanySwitcher";
import { CompanyForm } from "./CompanyForm";
import { Members } from "./Members";
import { Roles } from "./Roles";
import { Store } from "./Store";
import { Activity } from "./Activity";
import { activityPeople } from "../activity";

const needsCompany = (
  <Alert>
    Pick a company first. <a href="/business/switch">Choose or create one</a>.
  </Alert>
);

export const pages: BlockPages = {
  activity: async ({ ctx }) =>
    !ctx.companyId ? (
      needsCompany
    ) : can(ctx, "companies.activity.view") ? (
      <Activity people={await activityPeople(ctx)} />
    ) : (
      <Alert variant="error">Only the Owner can see the activity log.</Alert>
    ),
  // Pages whose header shows live counts render their own PageHeader.
  switch: ({ ctx }) => <CompanySwitcher activeCompanyId={ctx.companyId} />,

  details: ({ ctx }) =>
    ctx.companyId ? (
      <>
        <PageHeader title={ctx.solo ? "Business details" : "Company details"} />
        <CompanyForm mode="edit" canEdit={can(ctx, "companies.details.edit")} />
      </>
    ) : (
      needsCompany
    ),

  members: ({ ctx }) =>
    ctx.companyId ? (
      <Members
        canInvite={can(ctx, "companies.members.invite")}
        canManage={can(ctx, "companies.members.manage")}
        myUserId={ctx.userId}
      />
    ) : (
      needsCompany
    ),

  roles: ({ ctx }) =>
    ctx.companyId ? (
      <Roles canManage={can(ctx, "companies.roles.manage")} />
    ) : (
      needsCompany
    ),

  store: ({ ctx }) =>
    ctx.companyId ? (
      <Store />
    ) : (
      needsCompany
    ),
};
