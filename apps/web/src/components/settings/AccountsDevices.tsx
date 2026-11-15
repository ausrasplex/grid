"use client";

// Settings › Accounts & devices (server admin): every account on this
// server; tap one to see the devices they're signed in on and sign any out
// (a lost phone, someone who's left).

import { useState } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  EmptyState,
  Icon,
  List,
  ListRow,
  Loading,
  SearchInput,
  Section,
  Sheet,
  SheetContent,
  Stack,
  TapRow,
  api,
  describeDevice,
  useAction,
  useApi,
} from "@grid/ui";

interface Device {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  updatedAt: string;
  /** The device you're using now: can't be signed out from here. */
  current: boolean;
}

interface Account {
  id: string;
  name: string;
  email: string;
  serverAdmin: boolean;
  avatarUrl: string | null;
  createdAt: string;
  canSignIn: boolean;
  businesses: { name: string; invited: boolean }[];
  devices: Device[];
}

const when = (value: string) => new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const deviceWords = (count: number) => (count === 0 ? "Not signed in" : count === 1 ? "1 device" : `${count} devices`);

export function AccountsDevices() {
  const { data, error, loading, reload } = useApi<{ accounts: Account[] }>("/server/accounts");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  if (loading && !data) return <Loading rows={5} />;
  if (error || !data) return <Alert variant="error">{error ?? "Couldn't load the accounts"}</Alert>;

  const words = search.trim().toLowerCase();
  const shown = data.accounts.filter(
    (account) => !words || [account.name, account.email, ...account.businesses.map((business) => business.name)].some((text) => text.toLowerCase().includes(words)),
  );
  const open = data.accounts.find((account) => account.id === openId) ?? null;
  const signedIn = data.accounts.reduce((total, account) => total + account.devices.length, 0);

  return (
    <Stack>
      <SearchInput label="Search accounts" placeholder="Name, email or business" value={search} onChange={(event) => setSearch(event.target.value)} />
      <Section title={`${data.accounts.length} ${data.accounts.length === 1 ? "account" : "accounts"}`} description={`${deviceWords(signedIn).replace("Not signed in", "No devices")} signed in across the server.`} flush>
        {shown.length === 0 ? (
          <div className="px-4 pb-4 sm:px-5">
            <EmptyState title="No one matches that" />
          </div>
        ) : (
          <List>
            {shown.map((account) => (
              <TapRow
                key={account.id}
                leading={<Avatar name={account.name} src={account.avatarUrl} />}
                title={account.name}
                meta={`${account.email} · ${deviceWords(account.devices.length)}${account.devices[0] ? ` · last used ${when(account.devices[0].updatedAt)}` : ""}`}
                badges={<AccountBadges account={account} />}
                onClick={() => setOpenId(account.id)}
              />
            ))}
          </List>
        )}
      </Section>
      <Sheet open={!!open} onOpenChange={(value) => !value && setOpenId(null)}>
        {open && <AccountSheet account={open} onChanged={reload} />}
      </Sheet>
    </Stack>
  );
}

function AccountBadges({ account }: { account: Account }) {
  return (
    <>
      {account.serverAdmin && <Badge variant="default">Server admin</Badge>}
      {!account.canSignIn && <Badge variant="warning">Hasn&apos;t joined yet</Badge>}
    </>
  );
}

function AccountSheet({ account, onChanged }: { account: Account; onChanged: () => void | Promise<void> }) {
  const action = useAction();
  const others = account.devices.filter((device) => !device.current);

  const signOut = (body: { sessionId: string } | { userId: string }, question: string) => {
    if (!confirm(question)) return;
    void action.run(async () => {
      await api("/server/accounts/sessions", { method: "DELETE", body });
      await onChanged();
      return true;
    });
  };

  return (
    <SheetContent title={account.name} description={account.email}>
      <div className="flex flex-col gap-4 px-2 pb-2">
        <div className="flex items-center gap-3">
          <Avatar name={account.name} src={account.avatarUrl} className="size-14 text-lg" />
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <AccountBadges account={account} />
            <span className="text-sm text-muted-foreground">Account made {when(account.createdAt)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Businesses</span>
          <p className="text-sm text-muted-foreground">
            {account.businesses.length
              ? account.businesses.map((business) => (business.invited ? `${business.name} (invited)` : business.name)).join(", ")
              : "Not in any business"}
          </p>
        </div>

        <Section
          title="Signed-in devices"
          flush
          actions={
            others.length > 1 ? (
              <Button
                variant="outline"
                size="sm"
                disabled={action.busy}
                onClick={() => signOut({ userId: account.id }, `Sign ${account.name} out of ${others.length} devices? They'll need their password to get back in.`)}
              >
                Sign out everywhere
              </Button>
            ) : undefined
          }
        >
          {account.devices.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground sm:px-5">Not signed in anywhere.</p>
          ) : (
            <List>
              {account.devices.map((device) => (
                <ListRow
                  key={device.id}
                  title={
                    <span className="flex items-center gap-2">
                      <Icon name="phone" className="size-5 text-muted-foreground" />
                      {describeDevice(device.userAgent)}
                    </span>
                  }
                  meta={[
                    device.current ? "This device (yours, now)" : `Last used ${when(device.updatedAt)}`,
                    `signed in ${when(device.createdAt)}`,
                    device.ipAddress ? `IP ${device.ipAddress}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  actions={
                    device.current ? undefined : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={action.busy}
                        onClick={() => signOut({ sessionId: device.id }, `Sign ${account.name} out of this ${describeDevice(device.userAgent)}?`)}
                      >
                        Sign out
                      </Button>
                    )
                  }
                />
              ))}
            </List>
          )}
        </Section>
        <p className="text-sm text-muted-foreground">Signing a device out works on its very next tap. It doesn&apos;t change their password: if it might be known, reset it from the sign-in page.</p>
        <Alert variant="error">{action.error}</Alert>
      </div>
    </SheetContent>
  );
}
