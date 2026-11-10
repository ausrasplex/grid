"use client";

import { Plus } from "lucide-react";
import {
  ActionButton,
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  List,
  ListRow,
  Loading,
  PageHeader,
  Section,
  Stack,
  TapRow,
  api,
  useAction,
  useApi,
} from "@grid/ui";

interface MyCompany {
  membershipId: string;
  status: "ACTIVE" | "INVITED";
  role: string;
  company: { id: string; name: string; tradeProfile: string };
}

const pretty = (trade: string) => (trade === "CONTROLS_BMS" ? "Controls / BMS" : trade.charAt(0) + trade.slice(1).toLowerCase());

export function CompanySwitcher({ activeCompanyId }: { activeCompanyId: string | null }) {
  const { data, error, loading, reload } = useApi<MyCompany[]>("/companies/mine");
  const action = useAction();

  const choose = (companyId: string) =>
    action.run(async () => {
      await api("/session/company", { body: { companyId } });
      window.location.href = "/";
    });

  const respond = (membershipId: string, accept: boolean) =>
    action.run(async () => {
      await api(`/companies/invites/${membershipId}/${accept ? "accept" : "decline"}`, { method: "POST" });
      await reload();
    });

  const active = (data ?? []).filter((membership) => membership.status === "ACTIVE");
  const invites = (data ?? []).filter((membership) => membership.status === "INVITED");
  const meta = data
    ? `${active.length} compan${active.length === 1 ? "y" : "ies"}${invites.length ? ` · ${invites.length} invitation${invites.length === 1 ? "" : "s"}` : ""}`
    : undefined;

  const header = (
    <PageHeader
      title="Companies"
      meta={meta}
      subtitle="Switch between the companies you work for, or accept an invitation."
      actions={
        <ActionButton
          icon={<Plus />}
          label="New company"
          variant="outline"
          onClick={() => {
            window.location.href = "/setup";
          }}
        />
      }
    />
  );

  if (loading) return <>{header}<Loading /></>;
  if (error) return <>{header}<Alert variant="error">{error}</Alert></>;

  return (
    <>
    {header}
    <Stack>
      <Alert variant="error">{action.error}</Alert>

      {invites.length > 0 && (
        <Section title="Invitations" flush>
          <List>
            {invites.map((invite) => (
              <ListRow
                key={invite.membershipId}
                title={invite.company.name}
                meta={`Invited as ${invite.role}`}
                actions={
                  <>
                    <Button onClick={() => respond(invite.membershipId, true)} disabled={action.busy}>
                      Accept
                    </Button>
                    <Button variant="outline" onClick={() => respond(invite.membershipId, false)} disabled={action.busy}>
                      Decline
                    </Button>
                  </>
                }
              />
            ))}
          </List>
        </Section>
      )}

      <Section title="Your companies" flush>
        {active.length === 0 ? (
          <EmptyState title="You're not part of a company yet">Create one, or ask your boss to invite you.</EmptyState>
        ) : (
          <List>
            {/* Tap a company to switch to it (one line per company on every screen) */}
            {active.map((membership) => {
              const current = membership.company.id === activeCompanyId;
              return (
                <TapRow
                  key={membership.membershipId}
                  leading={<Avatar name={membership.company.name} className="rounded-xl" />}
                  title={membership.company.name}
                  meta={`${pretty(membership.company.tradeProfile)} · ${membership.role}`}
                  badges={current ? <Badge variant="success">Current</Badge> : undefined}
                  onClick={() => (current ? (window.location.href = "/") : void choose(membership.company.id))}
                />
              );
            })}
          </List>
        )}
      </Section>
    </Stack>
    </>
  );
}
