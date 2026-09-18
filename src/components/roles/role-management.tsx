"use client";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAppData, useAppQuery } from "@/components/app/app-data-provider";
import {
  PageShell,
  PageShellActions,
  PageShellContent,
  PageShellDescription,
  PageShellHeader,
  PageShellHeading,
  PageShellTitle,
} from "@/components/app/page-shell";
import { ApiError, type RoleRecord } from "@/lib/api";
import { allPermissions, permissionCatalog, type Permission } from "@/lib/auth/permissions";
import { useId, useState } from "react";

export function RoleManagement() {
  const { api, invalidate, refreshAccount, store, generation } = useAppData();
  const roles = useAppQuery("roles", {}, signal => api.roles.list({ signal }));
  const [editing, setEditing] = useState<RoleRecord | "new" | null>(null);
  const [deleting, setDeleting] = useState<RoleRecord | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  return (
    <PageShell>
      <PageShellHeader>
        <PageShellHeading>
          <PageShellTitle>Roles</PageShellTitle>
          <PageShellDescription>
            Create roles and choose what each role can access. New roles start with no permissions.
          </PageShellDescription>
        </PageShellHeading>
        <PageShellActions>
          <Button onClick={() => setEditing("new")}>Create role</Button>
        </PageShellActions>
      </PageShellHeader>

      <PageShellContent>
        {roles.loading && <div role="status" aria-busy="true" aria-label="Loading roles" className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex-row flex-wrap items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>}

        {!!roles.error && <Alert variant="destructive">
          {roles.error instanceof Error ? roles.error.message : "Roles could not load."}{" "}
          <Button variant="link" className="h-auto px-0" onClick={roles.refresh}>Retry</Button>
        </Alert>}

        <ul className="flex flex-col gap-3">
          {roles.data?.map(role => (
            <li key={role.id}>
              <Card>
                <CardContent className="flex-row flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {role.name}
                      {role.isSystem && <Badge variant="secondary">Protected system role</Badge>}
                    </h2>
                    {role.description && <p className="mt-1 text-xs text-muted-foreground">{role.description}</p>}
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">{role.memberCount} assigned {role.memberCount === 1 ? "account" : "accounts"} · {role.isSystem ? "Full access" : `${role.permissions.length} permissions`}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={() => setEditing(role)}>{role.isSystem ? "View permissions" : "Edit role"}</Button>
                    {!role.isSystem && <Button
                      variant="outline"
                      className="text-destructive"
                      disabled={role.memberCount > 0}
                      title={role.memberCount ? "Remove role assignments before deleting this role." : undefined}
                      onClick={() => { setError(""); setDeleting(role); }}
                    >
                      Delete role
                    </Button>}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </PageShellContent>

      <Dialog open={editing !== null} onOpenChange={open => { if (!open) setEditing(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Create role" : editing?.isSystem ? "System permissions" : "Edit role"}</DialogTitle>
            <DialogDescription>
              Write permissions require Read for the same entity. Field definitions, roles, and members are managed by system accounts.
            </DialogDescription>
          </DialogHeader>
          {editing && <RoleEditor
            key={editing === "new" ? "new" : `${editing.id}:${editing.revision}`}
            role={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={async () => { invalidate(["roles", "members"]); setEditing(null); await refreshAccount(); }}
            onReload={async id => setEditing(await api.roles.get(id))}
          />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={open => { if (!open && !pending) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete role?</DialogTitle>
            <DialogDescription>Delete {deleting?.name}? Only roles with no assigned accounts can be deleted.</DialogDescription>
          </DialogHeader>
          {error && <Alert variant="destructive">{error}</Alert>}
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={async () => {
              if (!deleting || pending) return; setPending(true); setError("");
              try { await api.roles.delete(deleting.id, deleting.revision); if (store.isCurrent(generation)) { invalidate(["roles"]); setDeleting(null); } }
              catch (failure) { if (store.isCurrent(generation)) { setError(failure instanceof Error ? failure.message : "Role could not be deleted."); roles.refresh(); } }
              finally { if (store.isCurrent(generation)) setPending(false); }
            }}>{pending ? "Deleting…" : "Delete role"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function RoleEditor({ role, onClose, onSaved, onReload }: { role: RoleRecord | null; onClose: () => void; onSaved: () => Promise<void>; onReload: (id: string) => Promise<void> }) {
  const { api, store, generation } = useAppData();
  const id = useId();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<Permission[]>(role?.isSystem ? allPermissions : role?.permissions ?? []);
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [conflict, setConflict] = useState(false);
  const has = (permission: Permission) => permissions.some(item => item.entity === permission.entity && item.action === permission.action);
  function toggle(permission: Permission, checked: boolean) {
    setPermissions(current => {
      if (!checked) return current.filter(item => !(item.entity === permission.entity && (permission.action === "read" || item.action === permission.action)));
      const next = [...current, permission];
      if (permission.action !== "read" && !current.some(item => item.entity === permission.entity && item.action === "read")) next.push({ entity: permission.entity, action: "read" });
      return next;
    });
  }
  return <form className="flex flex-col gap-4" onSubmit={async event => {
    event.preventDefault(); if (pending || role?.isSystem) return; setPending(true); setError(""); setConflict(false);
    try { const body = { name: name.trim(), description: description.trim() || null, permissions }; if (role) await api.roles.update(role.id, { ...body, expectedRevision: role.revision }); else await api.roles.create(body); if (store.isCurrent(generation)) await onSaved(); }
    catch (failure) { if (store.isCurrent(generation)) { setError(failure instanceof Error ? failure.message : "Role could not be saved."); setConflict(!!role && failure instanceof ApiError && failure.status === 409 && failure.message.includes("Role changed")); } }
    finally { if (store.isCurrent(generation)) setPending(false); }
  }}>
    <fieldset disabled={pending || !!role?.isSystem}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-name`}>Role name</FieldLabel>
          <Input id={`${id}-name`} required maxLength={100} value={name} onChange={event => setName(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-description`}>Description</FieldLabel>
          <Textarea id={`${id}-description`} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} />
        </Field>

        <div className="flex flex-col gap-3">
          {Object.keys(permissionCatalog).map(entity => <FieldSet key={entity} className="gap-3 rounded-lg border p-3">
            <FieldLegend variant="label" className="mb-0 capitalize">{entity}</FieldLegend>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-5">
              {allPermissions.filter(permission => permission.entity === entity).map(permission => <div key={permission.action} className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-${permission.entity}-${permission.action}`}
                  aria-label={`${entity} ${permission.action}`}
                  checked={has(permission)}
                  onCheckedChange={checked => toggle(permission, checked === true)}
                />
                <Label htmlFor={`${id}-${permission.entity}-${permission.action}`} className="text-xs capitalize">{permission.action}</Label>
              </div>)}
            </div>
          </FieldSet>)}
        </div>

        <FieldDescription>
          Creating deals also requires Company Read. Linking records and logging activity require Read for all linked entities. Archive keeps records available for restoration; deleting activity is permanent.
        </FieldDescription>
      </FieldGroup>
    </fieldset>

    {error && <Alert variant="destructive">{error}</Alert>}
    {conflict && role && <Button type="button" variant="outline" className="self-start" onClick={async () => { try { await onReload(role.id); } catch (failure) { setError(failure instanceof Error ? failure.message : "Role could not reload."); } }}>Reload current role and discard draft</Button>}
    <DialogFooter>
      <Button type="button" variant="outline" disabled={pending} onClick={onClose}>{role?.isSystem ? "Close" : "Cancel"}</Button>
      {!role?.isSystem && <Button type="submit" disabled={pending || conflict}>{pending ? "Saving…" : "Save role"}</Button>}
    </DialogFooter>
  </form>;
}
