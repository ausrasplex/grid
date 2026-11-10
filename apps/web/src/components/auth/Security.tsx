"use client";

// Profile › Sign-in & devices: set or change your password, and see and
// sign out the devices you're signed in on.

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Field, Icon, List, ListRow, Loading, Section, Stack, api, useAction } from "@grid/ui";
import { authClient } from "@/lib/auth-client";

interface Device {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** "iPhone · Safari" from a user-agent string, good enough to recognise your own devices. */
function describe(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device";
  const device = /iPhone/.test(userAgent)
    ? "iPhone"
    : /iPad/.test(userAgent)
      ? "iPad"
      : /Android/.test(userAgent)
        ? "Android"
        : /Mac OS X/.test(userAgent)
          ? "Mac"
          : /Windows/.test(userAgent)
            ? "Windows PC"
            : /Linux/.test(userAgent)
              ? "Linux"
              : "Device";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  return `${device} · ${browser}`;
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

function DevicesSection() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [thisToken, setThisToken] = useState<string | null>(null);
  const action = useAction();

  const load = useCallback(async () => {
    const [{ data: list }, { data: session }] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
    setThisToken(session?.session.token ?? null);
    setDevices(
      ((list ?? []) as Device[]).sort((first, second) => new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!devices) return <Loading rows={3} />;
  const others = devices.filter((device) => device.token !== thisToken);

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
            onClick={() => action.run(async () => (await authClient.revokeOtherSessions(), await load(), true))}
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
                {describe(device.userAgent)}
              </span>
            }
            meta={device.token === thisToken ? "This device" : `Last used ${when(device.updatedAt)} · signed in ${when(device.createdAt)}`}
            actions={
              device.token === thisToken ? undefined : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={action.busy}
                  onClick={() => action.run(async () => (await authClient.revokeSession({ token: device.token }), await load(), true))}
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
