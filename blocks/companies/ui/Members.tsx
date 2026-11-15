"use client";

import { useState } from "react";
import { Check, Copy, Link2, Mail, Phone, Share2, UserPlus } from "lucide-react";
import {
  ActionButton,
  Alert,
  Avatar,
  Badge,
  Button,
  Field,
  FormActions,
  List,
  ListRow,
  Loading,
  NativeSelect,
  PageHeader,
  Section,
  SelectField,
  Sheet,
  SheetContent,
  TapRow,
  api,
  useAction,
  useApi,
} from "@grid/ui";

interface Member {
  membershipId: string;
  status: "ACTIVE" | "INVITED";
  user: { id: string; name: string; email: string; phone: string | null; avatarUrl: string | null };
  role: { id: string; name: string; systemRole: string | null };
  /** Invited: their join link ("/join/…"), or null when it has run out. Only for people who may invite. */
  invitePath?: string | null;
}
interface RoleList {
  roles: { id: string; name: string; systemRole: string | null }[];
}
type RoleOption = { value: string; label: string };

const TITLE = "Members";
const SUBTITLE = "People who work for this company and their roles.";

export function Members({ canInvite, canManage, myUserId }: { canInvite: boolean; canManage: boolean; myUserId: string }) {
  const members = useApi<Member[]>("/companies/current/members");
  const roles = useApi<RoleList>("/companies/current/roles");
  const action = useAction();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selected, setSelected] = useState<Member | null>(null);
  /** The invited person whose join link is showing (tablet and up). */
  const [linkFor, setLinkFor] = useState<Member | null>(null);

  const list = members.data ?? [];
  const invited = list.filter((item) => item.status === "INVITED").length;
  const meta = members.data
    ? `${list.length} member${list.length === 1 ? "" : "s"}${invited ? ` · ${invited} invited` : ""}`
    : undefined;

  const roleOptions: RoleOption[] = (roles.data?.roles ?? []).map((role) => ({ value: role.id, label: role.name }));
  const defaultRole = roles.data?.roles.find((role) => role.systemRole === "EMPLOYEE")?.id ?? roleOptions[0]?.value ?? "";

  const changeRole = async (member: Member, roleId: string) => {
    const ok = await action.run(() => api(`/companies/current/members/${member.membershipId}`, { method: "PATCH", body: { roleId } }));
    if (ok) await members.reload();
    return !!ok;
  };
  const remove = async (member: Member) => {
    if (!confirm(`Remove ${member.user.name} from this company?`)) return false;
    const ok = await action.run(() => api(`/companies/current/members/${member.membershipId}`, { method: "DELETE" }));
    if (ok) await members.reload();
    return !!ok;
  };

  const badgesFor = (member: Member) => (
    <>
      {member.status === "INVITED" && <Badge variant="warning">Invited</Badge>}
      {member.user.id === myUserId && <Badge>You</Badge>}
    </>
  );

  return (
    <>
      <PageHeader
        title={TITLE}
        meta={meta}
        subtitle={SUBTITLE}
        actions={
          canInvite ? (
            <ActionButton icon={<UserPlus />} label="Invite" onClick={() => setInviteOpen(true)} disabled={roles.loading} />
          ) : undefined
        }
      />

      {members.loading || roles.loading ? (
        <Loading rows={5} />
      ) : members.error ? (
        <Alert variant="error">{members.error}</Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <Alert variant="error">{action.error}</Alert>

          <Section flush>
            {/* Phone: one compact line per person; tap for details and actions */}
            <div className="sm:hidden">
              <List>
                {list.map((item) => (
                  <TapRow
                    key={item.membershipId}
                    leading={<Avatar name={item.user.name} src={item.user.avatarUrl} />}
                    title={item.user.name}
                    badges={badgesFor(item)}
                    meta={item.role.name}
                    onClick={() => setSelected(item)}
                  />
                ))}
              </List>
            </div>

            {/* Tablet and up: actions inline */}
            <div className="hidden sm:block">
              <List>
                {list.map((item) => (
                  <ListRow
                    key={item.membershipId}
                    title={item.user.name}
                    meta={item.user.email}
                    badges={
                      <>
                        {badgesFor(item)}
                        {!canManage && <Badge variant="secondary">{item.role.name}</Badge>}
                      </>
                    }
                    actions={
                      canManage || (canInvite && item.status === "INVITED") ? (
                        <>
                          {canInvite && item.status === "INVITED" && (
                            <Button variant="outline" onClick={() => setLinkFor(item)}>
                              <Link2 /> Invite link
                            </Button>
                          )}
                          {canManage && (
                          <>
                          <NativeSelect
                            aria-label={`Role for ${item.user.name}`}
                            value={item.role.id}
                            disabled={action.busy}
                            options={roleOptions}
                            className="sm:w-44"
                            onChange={(event) => void changeRole(item, event.target.value)}
                          />
                          <Button variant="outline" className="text-destructive" disabled={action.busy} onClick={() => void remove(item)}>
                            Remove
                          </Button>
                          </>
                          )}
                        </>
                      ) : undefined
                    }
                  />
                ))}
              </List>
            </div>
          </Section>
        </div>
      )}

      {linkFor && (
        <Sheet open onOpenChange={(open) => !open && setLinkFor(null)}>
          <SheetContent desktop="dialog" title={`Invite link for ${linkFor.user.name}`} description="Send it by text, WhatsApp or however you like. Opening it lets them set a password and join.">
            <div className="px-2">
              <InviteLink membershipId={linkFor.membershipId} path={linkFor.invitePath ?? null} name={linkFor.user.name} onRenewed={() => void members.reload()} />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {canInvite && (
        <InviteSheet
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          roleOptions={roleOptions}
          defaultRole={defaultRole}
          onInvited={() => void members.reload()}
        />
      )}

      <MemberSheet
        member={selected}
        onClose={() => setSelected(null)}
        canManage={canManage}
        canInvite={canInvite}
        onRenewed={() => void members.reload()}
        roleOptions={roleOptions}
        busy={action.busy}
        error={action.error}
        onChangeRole={async (member, roleId) => {
          if (await changeRole(member, roleId)) setSelected(null);
        }}
        onRemove={async (member) => {
          if (await remove(member)) setSelected(null);
        }}
      />
    </>
  );
}

/**
 * An invited person's join link, to copy or share by hand (handy when the
 * server has no email). "Make a new link" replaces it (the old one stops working).
 */
function InviteLink({ membershipId, path, name, onRenewed }: { membershipId: string; path: string | null; name: string; onRenewed: () => void }) {
  const [current, setCurrent] = useState(path);
  const [copied, setCopied] = useState(false);
  const renew = useAction();
  const url = current && typeof window !== "undefined" ? `${window.location.origin}${current}` : null;
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  return (
    <div className="flex flex-col gap-2">
      {url ? (
        <>
          <input
            readOnly
            aria-label={`Invite link for ${name}`}
            value={url}
            onFocus={(event) => event.target.select()}
            className="h-touch w-full rounded-md border border-input bg-card px-3 font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(url).catch(() => undefined);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
            </Button>
            {canShare && (
              <Button type="button" variant="outline" onClick={() => void navigator.share({ title: "Join on Grid", text: `${name}, here's your invite to Grid:`, url }).catch(() => undefined)}>
                <Share2 /> Share
              </Button>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">This link has run out. Make a new one to send.</p>
      )}
      <Alert variant="error">{renew.error}</Alert>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        disabled={renew.busy}
        onClick={async () => {
          const result = await renew.run(() => api<{ invitePath: string }>(`/companies/current/members/${membershipId}/link`, { body: {} }));
          if (result) {
            setCurrent(result.invitePath);
            onRenewed();
          }
        }}
      >
        {renew.busy ? "Making…" : "Make a new link"}
      </Button>
    </div>
  );
}

function InviteSheet({
  open,
  onOpenChange,
  roleOptions,
  defaultRole,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleOptions: RoleOption[];
  defaultRole: string;
  onInvited: () => void;
}) {
  const invite = useAction();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");
  /** Just invited: show their join link to send. */
  const [sent, setSent] = useState<{ membershipId: string; path: string; name: string } | null>(null);

  return (
    <Sheet open={open} onOpenChange={(value) => (onOpenChange(value), !value && setSent(null))}>
      <SheetContent desktop="dialog"
        title={sent ? `Send ${sent.name} their link` : "Invite someone"}
        description={
          sent
            ? "Send it by text, WhatsApp or however you like. Opening it lets them set a password and join. It works for 14 days; you can find it again on Members."
            : "You'll get a link to send them. They can also accept next time they sign in."
        }
        className="md:bottom-6 md:mx-auto md:max-w-md md:rounded-2xl md:border"
      >
        {sent ? (
          <div className="flex flex-col gap-4 px-2">
            <InviteLink membershipId={sent.membershipId} path={sent.path} name={sent.name} onRenewed={onInvited} />
            <FormActions>
              <Button size="lg" onClick={() => (setSent(null), onOpenChange(false))}>
                Done
              </Button>
            </FormActions>
          </div>
        ) : (
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await invite.run(() =>
              api<{ membershipId: string; invitePath: string }>("/companies/current/members", { body: { email, name: name || undefined, roleId: roleId || defaultRole } }),
            );
            if (result) {
              setSent({ membershipId: result.membershipId, path: result.invitePath, name: name.trim() || email });
              setEmail("");
              setName("");
              onInvited();
            }
          }}
        >
          <Field
            label="Email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Field label="Name (optional)" value={name} onChange={(event) => setName(event.target.value)} />
          <SelectField label="Role" value={roleId || defaultRole} onChange={(event) => setRoleId(event.target.value)} options={roleOptions} />
          <Alert variant="error">{invite.error}</Alert>
          <FormActions>
            <Button type="submit" size="lg" disabled={invite.busy}>
              {invite.busy ? "Inviting…" : "Invite"}
            </Button>
          </FormActions>
        </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Phone: a person's details, quick call/email, and (for managers) role and remove. */
function MemberSheet({
  member,
  onClose,
  canManage,
  roleOptions,
  busy,
  error,
  onChangeRole,
  onRemove,
  canInvite,
  onRenewed,
}: {
  member: Member | null;
  onClose: () => void;
  canManage: boolean;
  canInvite: boolean;
  onRenewed: () => void;
  roleOptions: RoleOption[];
  busy: boolean;
  error: string | null;
  onChangeRole: (member: Member, roleId: string) => Promise<void>;
  onRemove: (member: Member) => Promise<void>;
}) {
  const [roleId, setRoleId] = useState<string | null>(null);
  const shown = member;

  return (
    <Sheet
      open={!!shown}
      onOpenChange={(open) => {
        if (!open) {
          setRoleId(null);
          onClose();
        }
      }}
    >
      {shown && (
        <SheetContent title={shown.user.name} description={shown.status === "INVITED" ? "Invitation not accepted yet" : shown.role.name}>
          <div className="flex flex-col gap-4 px-2">
            {/* Quick contact: one tap to email or call from site */}
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline">
                <a href={`mailto:${shown.user.email}`}>
                  <Mail /> Email
                </a>
              </Button>
              {shown.user.phone ? (
                <Button asChild variant="outline">
                  <a href={`tel:${shown.user.phone}`}>
                    <Phone /> Call
                  </a>
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <Phone /> No number
                </Button>
              )}
            </div>
            <p className="truncate px-1 text-sm text-muted-foreground">{shown.user.email}</p>
            {canInvite && shown.status === "INVITED" && (
              <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3">
                <p className="text-sm font-medium">Invite link</p>
                <InviteLink membershipId={shown.membershipId} path={shown.invitePath ?? null} name={shown.user.name} onRenewed={onRenewed} />
              </div>
            )}

            {canManage && (
              <>
                <SelectField
                  label="Role"
                  value={roleId ?? shown.role.id}
                  onChange={(event) => setRoleId(event.target.value)}
                  options={roleOptions}
                  disabled={busy}
                />
                <Alert variant="error">{error}</Alert>
                <FormActions>
                  <Button variant="outline" size="lg" className="text-destructive" disabled={busy} onClick={() => void onRemove(shown)}>
                    Remove from company
                  </Button>
                  <Button
                    size="lg"
                    disabled={busy || !roleId || roleId === shown.role.id}
                    onClick={() => roleId && void onChangeRole(shown, roleId)}
                  >
                    Save role
                  </Button>
                </FormActions>
              </>
            )}
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}
