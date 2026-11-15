"use client";

// Settings › Sign-in & devices: set or change your password, and see and
// sign out the devices you're signed in on.

import { useEffect, useState } from "react";
import { Alert, Button, Field, Icon, List, ListRow, Loading, Section, Stack, api, describeDevice, useAction, useApi } from "@grid/ui";
import { authClient } from "@/lib/auth-client";

interface Device {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  updatedAt: string;
  /** The device you're using now. */
  current: boolean;
}

const when = (value: Date | string) =>
  new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function Security() {
  return (
    <Stack>
      <PasswordSection />
      <DevicesSection />
    </Stack>
  );
}

function PasswordSection() {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saved, setSaved] = useState(false);
  const action = useAction();

  useEffect(() => {
    authClient.listAccounts().then(({ data }) => setHasPassword(!!data?.some((account) => account.providerId === "credential")));
  }, []);

  if (hasPassword === null) return <Loading rows={2} />;

  return (
    <Section
      title={hasPassword ? "Change password" : "Add a password"}
      description={
        hasPassword
          ? "Changing it signs you out everywhere else."
          : "You've been signing in with emailed links. Add a password to sign in without checking your email."
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaved(false);
          const ok = await action.run(async () => {
            if (hasPassword) {
              const { error } = await authClient.changePassword({
                currentPassword: current,
                newPassword: next,
                revokeOtherSessions: true,
              });
              if (error) throw new Error(error.status === 400 || error.status === 401 ? "Your current password isn't right" : error.message);
            } else {
              await api("/session/password", { body: { newPassword: next } });
            }
            return true;
          });
          if (ok) {
            setSaved(true);
            setCurrent("");
            setNext("");
            setHasPassword(true);
          }
        }}
      >
        {hasPassword && (
          <Field
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            required
          />
        )}
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          hint="At least 8 characters."
          value={next}
          onChange={(event) => setNext(event.target.value)}
          required
        />
        <Alert variant="error">{action.error}</Alert>
        {saved && <Alert variant="success">Password saved</Alert>}
        <Button type="submit" size="lg" block disabled={action.busy}>
          {action.busy ? "Saving…" : "Save password"}
        </Button>
      </form>
    </Section>
  );
}

/** Your devices (our own /api/session/devices: Better Auth's list refuses sign-ins older than a day). */
function DevicesSection() {
  const { data, error, reload } = useApi<{ devices: Device[] }>("/session/devices");
  const action = useAction();
  const signOut = (body: { sessionId: string } | { others: true }) =>
    action.run(async () => {
      await api("/session/devices", { method: "DELETE", body });
      await reload();
      return true;
    });

  if (error && !data) return <Alert variant="error">Couldn&apos;t load your devices: {error}</Alert>;
  if (!data) return <Loading rows={3} />;
  const devices = data.devices;
  const others = devices.filter((device) => !device.current);

  return (
    <Section
      title="Signed-in devices"
      description="You stay signed in on your own phone and tablet. Sign out anything you don't recognise."
      flush
      actions={
        others.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            disabled={action.busy}
            onClick={() => signOut({ others: true })}
          >
            Sign out others
          </Button>
        ) : undefined
      }
    >
      <List>
        {devices.map((device) => (
          <ListRow
            key={device.id}
            title={
              <span className="flex items-center gap-2">
                <Icon name="phone" className="size-5 text-muted-foreground" />
                {describeDevice(device.userAgent)}
              </span>
            }
            meta={[
              device.current ? "This device" : `Last used ${when(device.updatedAt)}`,
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
                  onClick={() => signOut({ sessionId: device.id })}
                >
                  Sign out
                </Button>
              )
            }
          />
        ))}
      </List>
      <div className="px-4 pb-4 empty:hidden sm:px-5">
        <Alert variant="error">{action.error}</Alert>
      </div>
    </Section>
  );
}
