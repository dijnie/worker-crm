"use client";
import Link from "next/link";
import { useState } from "react";
import { useAppData, useAppQuery } from "@/components/app/app-data-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ApiError, type RoleRecord } from "@/lib/api";
import { allPermissions, permissionCatalog, type Permission } from "@/lib/auth/permissions";

export function RoleManagement() {
  const { api, invalidate, refreshAccount, store, generation } = useAppData();
  const roles = useAppQuery("roles", {}, signal => api.roles.list({ signal }));
  const [editing, setEditing] = useState<RoleRecord | "new" | null>(null);
  const [deleting, setDeleting] = useState<RoleRecord | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
    <Link href="/settings" className="text-sm underline">Back to settings</Link>
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold">Roles</h1><p className="mt-2 text-sm text-muted-foreground">Create roles and choose what each role can access. New roles start with no permissions.</p></div><Button onClick={() => setEditing("new")}>Create role</Button></header>
    {roles.loading && <p role="status">Loading roles…</p>}
    {!!roles.error && <p role="alert">{roles.error instanceof Error ? roles.error.message : "Roles could not load."} <button className="underline" onClick={roles.refresh}>Retry</button></p>}
    <ul className="divide-y rounded-lg border">{roles.data?.map(role => <li key={role.id} className="flex flex-wrap items-center justify-between gap-4 p-4"><div><h2 className="font-medium">{role.name}{role.isSystem && <span className="ml-2 text-xs text-muted-foreground">Protected system role</span>}</h2>{role.description && <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>}<p className="mt-2 text-xs text-muted-foreground">{role.memberCount} assigned {role.memberCount === 1 ? "account" : "accounts"} · {role.isSystem ? "Full access" : `${role.permissions.length} permissions`}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setEditing(role)}>{role.isSystem ? "View permissions" : "Edit role"}</Button>{!role.isSystem && <Button variant="outline" disabled={role.memberCount > 0} title={role.memberCount ? "Remove role assignments before deleting this role." : undefined} onClick={() => { setError(""); setDeleting(role); }}>Delete role</Button>}</div></li>)}</ul>
    <Dialog open={editing !== null} onOpenChange={open => { if (!open) setEditing(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogTitle>{editing === "new" ? "Create role" : editing?.isSystem ? "System permissions" : "Edit role"}</DialogTitle><DialogDescription>Write permissions require Read for the same entity. Field definitions, roles, and members are managed by system accounts.</DialogDescription>{editing && <RoleEditor key={editing === "new" ? "new" : `${editing.id}:${editing.revision}`} role={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { invalidate(["roles", "members"]); setEditing(null); await refreshAccount(); }} onReload={async id => setEditing(await api.roles.get(id))} />}</DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !pending) setDeleting(null); }}><DialogContent><DialogTitle>Delete role?</DialogTitle><DialogDescription>Delete {deleting?.name}? Only roles with no assigned accounts can be deleted.</DialogDescription>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={pending} onClick={async () => {
      if (!deleting || pending) return; setPending(true); setError("");
      try { await api.roles.delete(deleting.id, deleting.revision); if (store.isCurrent(generation)) { invalidate(["roles"]); setDeleting(null); } }
      catch (failure) { if (store.isCurrent(generation)) { setError(failure instanceof Error ? failure.message : "Role could not be deleted."); roles.refresh(); } }
      finally { if (store.isCurrent(generation)) setPending(false); }
    }}>{pending ? "Deleting…" : "Delete role"}</Button></div></DialogContent></Dialog>
  </div>;
}
function RoleEditor({ role, onClose, onSaved, onReload }: { role: RoleRecord | null; onClose: () => void; onSaved: () => Promise<void>; onReload: (id: string) => Promise<void> }) {
  const { api, store, generation } = useAppData();
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
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault(); if (pending || role?.isSystem) return; setPending(true); setError(""); setConflict(false);
    try { const body = { name: name.trim(), description: description.trim() || null, permissions }; if (role) await api.roles.update(role.id, { ...body, expectedRevision: role.revision }); else await api.roles.create(body); if (store.isCurrent(generation)) await onSaved(); }
    catch (failure) { if (store.isCurrent(generation)) { setError(failure instanceof Error ? failure.message : "Role could not be saved."); setConflict(!!role && failure instanceof ApiError && failure.status === 409 && failure.message.includes("Role changed")); } }
    finally { if (store.isCurrent(generation)) setPending(false); }
  }}><fieldset disabled={pending || !!role?.isSystem} className="space-y-4"><label className="block space-y-2"><span className="text-sm font-medium">Role name</span><Input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label><label className="block space-y-2"><span className="text-sm font-medium">Description</span><Textarea maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} /></label>
    <div className="space-y-3">{Object.keys(permissionCatalog).map(entity => <fieldset key={entity} className="rounded-md border p-3"><legend className="px-1 text-sm font-medium capitalize">{entity}</legend><div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{allPermissions.filter(permission => permission.entity === entity).map(permission => <label key={permission.action} className="flex min-h-9 items-center gap-2 text-sm capitalize"><input type="checkbox" aria-label={`${entity} ${permission.action}`} checked={has(permission)} onChange={event => toggle(permission, event.target.checked)} />{permission.action}</label>)}</div></fieldset>)}</div>
    <p className="text-xs text-muted-foreground">Creating deals also requires Company Read. Linking records and logging activity require Read for all linked entities. Archive keeps records available for restoration; deleting activity is permanent.</p></fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{conflict && role && <Button type="button" variant="outline" onClick={async () => { try { await onReload(role.id); } catch (failure) { setError(failure instanceof Error ? failure.message : "Role could not reload."); } }}>Reload current role and discard draft</Button>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>{role?.isSystem ? "Close" : "Cancel"}</Button>{!role?.isSystem && <Button type="submit" disabled={pending || conflict}>{pending ? "Saving…" : "Save role"}</Button>}</div>
  </form>;
}
