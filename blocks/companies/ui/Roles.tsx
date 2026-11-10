"use client";

import { useState } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import {
  ActionButton,
  Alert,
  Badge,
  Button,
  Checkbox,
  Field,
  FormActions,
  List,
  ListRow,
  Loading,
  PageHeader,
  Section,
  Sheet,
  SheetContent,
  Stack,
  TapRow,
  api,
  useAction,
  useApi,
} from "@grid/ui";

interface Role {
  id: string;
  name: string;
  systemRole: string | null;
  editable: boolean;
  permissions: string[];
  members: number;
}
interface RolesResponse {
  roles: Role[];
  catalog: { blockId: string; blockName: string; permissions: { key: string; label: string; description?: string }[] }[];
}

type Draft = { id: string | null; name: string; permissions: Set<string> };

const SUBTITLE = "Built-in roles get each block's default permissions automatically. Custom roles (e.g. Leading Hand) let you choose.";

const roleMeta = (role: Role) => `${role.members} member${role.members === 1 ? "" : "s"} · ${role.permissions.length} permissions`;

export function Roles({ canManage }: { canManage: boolean }) {
  const { data, error, loading, reload } = useApi<RolesResponse>("/companies/current/roles");
  const action = useAction();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<Role | null>(null);

  const custom = data?.roles.filter((role) => !role.systemRole).length ?? 0;
  const meta = data ? `${data.roles.length} roles${custom ? ` · ${custom} custom` : ""}` : undefined;

  const startNew = () => setDraft({ id: null, name: "", permissions: new Set() });
  const startEdit = (role: Role) => setDraft({ id: role.id, name: role.name, permissions: new Set(role.permissions) });
  const startCopy = (role: Role) => setDraft({ id: null, name: `${role.name} (custom)`, permissions: new Set(role.permissions) });
  const remove = async (role: Role) => {
    if (!confirm(`Delete the ${role.name} role?`)) return;
    const ok = await action.run(() => api(`/companies/current/roles/${role.id}`, { method: "DELETE" }));
    if (ok) {
      setSelected(null);
      await reload();
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader title="Roles" subtitle={SUBTITLE} />
        <Loading rows={4} />
      </>
    );
  }
  if (error || !data) return <Alert variant="error">{error ?? "Couldn't load roles"}</Alert>;

  // ---------- Editor: replaces the list so there's one thing on screen at a time ----------
  if (draft) {
    const toggle = (key: string, on: boolean) =>
      setDraft((currentDraft) => {
        if (!currentDraft) return currentDraft;
        const next = new Set(currentDraft.permissions);
        if (on) next.add(key);
        else next.delete(key);
        return { ...currentDraft, permissions: next };
      });

    return (
      <>
        <PageHeader title={draft.id ? "Edit role" : "New custom role"} meta={`${draft.permissions.size} permissions selected`} />
        <form
          className="flex flex-col gap-4 sm:gap-6"
          onSubmit={async (event) => {
            event.preventDefault();
            const body = { name: draft.name, permissions: [...draft.permissions] };
            const ok = await action.run(() =>
              draft.id ? api(`/companies/current/roles/${draft.id}`, { method: "PUT", body }) : api("/companies/current/roles", { body }),
            );
            if (ok) {
              setDraft(null);
              await reload();
            }
          }}
        >
          <Section>
            <Field label="Role name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
          </Section>

          {data.catalog.map((catalogEntry) => (
            <Section key={catalogEntry.blockId} title={catalogEntry.blockName} flush>
              <ul className="divide-y border-t">
                {catalogEntry.permissions.map((permission) => {
                  const id = `perm-${permission.key}`;
                  return (
                    <li key={permission.key}>
                      {/* Whole row is the tap target */}
                      <label htmlFor={id} className="flex min-h-touch-lg cursor-pointer items-start gap-3 px-4 py-3 active:bg-muted sm:px-5">
                        <Checkbox
                          id={id}
                          className="mt-0.5"
                          checked={draft.permissions.has(permission.key)}
                          onCheckedChange={(checked) => toggle(permission.key, checked === true)}
                        />
                        <span className="min-w-0">
                          <span className="block font-medium">{permission.label}</span>
                          {permission.description && <span className="block text-sm text-muted-foreground">{permission.description}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ))}

          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" size="lg" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={action.busy}>
              {action.busy ? "Saving…" : "Save role"}
            </Button>
          </FormActions>
        </form>
      </>
    );
  }

  // ---------- List ----------
  return (
    <>
      <PageHeader
        title="Roles"
        meta={meta}
        subtitle={SUBTITLE}
        actions={canManage ? <ActionButton icon={<Plus />} label="New role" onClick={startNew} /> : undefined}
      />
      <Stack>
        <Alert variant="error">{action.error}</Alert>
        <Section flush>
          {/* Phone: compact rows; actions in a sheet */}
          <div className="sm:hidden">
            <List>
              {data.roles.map((role) => (
                <TapRow
                  key={role.id}
                  title={role.name}
                  badges={role.systemRole ? <Badge>Built-in</Badge> : <Badge variant="success">Custom</Badge>}
                  meta={roleMeta(role)}
                  onClick={() => setSelected(role)}
                />
              ))}
            </List>
          </div>

          {/* Tablet and up: inline actions */}
          <div className="hidden sm:block">
            <List>
              {data.roles.map((role) => (
                <ListRow
                  key={role.id}
                  title={role.name}
                  badges={role.systemRole ? <Badge>Built-in</Badge> : <Badge variant="success">Custom</Badge>}
                  meta={roleMeta(role)}
                  actions={
                    canManage ? (
                      role.editable ? (
                        <>
                          <Button variant="outline" onClick={() => startEdit(role)}>
                            Edit
                          </Button>
                          <Button variant="outline" className="text-destructive" disabled={action.busy} onClick={() => void remove(role)}>
                            Delete
                          </Button>
                        </>
                      ) : (
                        <Button variant="outline" onClick={() => startCopy(role)}>
                          Copy as custom
                        </Button>
                      )
                    ) : undefined
                  }
                />
              ))}
            </List>
          </div>
        </Section>
      </Stack>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && (
          <SheetContent title={selected.name} description={roleMeta(selected)}>
            <div className="flex flex-col gap-2 px-2">
              {!canManage ? (
                <p className="px-1 text-sm text-muted-foreground">Only people who can manage roles can change this.</p>
              ) : selected.editable ? (
                <>
                  <Button size="lg" variant="outline" onClick={() => { const role = selected; setSelected(null); startEdit(role); }}>
                    <Pencil /> Edit permissions
                  </Button>
                  <Button size="lg" variant="outline" className="text-destructive" disabled={action.busy} onClick={() => void remove(selected)}>
                    <Trash2 /> Delete role
                  </Button>
                </>
              ) : (
                <>
                  <p className="px-1 pb-1 text-sm text-muted-foreground">
                    Built-in roles follow the blocks' defaults. Copy it to make your own version.
                  </p>
                  <Button size="lg" variant="outline" onClick={() => { const role = selected; setSelected(null); startCopy(role); }}>
                    <Copy /> Copy as custom role
                  </Button>
                </>
              )}
            </div>
          </SheetContent>
        )}
      </Sheet>
    </>
  );
}
