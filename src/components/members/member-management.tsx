"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { useAppData, useAppQuery } from "@/components/app/app-data-provider";
import { ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth/auth-client";
import type { MemberMutationInput, MemberRecord } from "@services/member.service";
import type { Page } from "@/lib/utils/validation";

const pageSize = 20;

export function MemberManagement({ currentUserId }: { currentUserId: string }) {
  const { api, store, generation, invalidate, clear, refreshAccount } = useAppData();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"all" | "active" | "revoked">("all");
  const [data, setData] = useState<Page<MemberRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<MemberRecord | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const roles = useAppQuery("roles", {}, signal => api.roles.list({ signal }));
  const members = useAppQuery("members", { page, status, revision }, (signal) => api.members.list({ page, limit: pageSize, ...(status === "all" ? {} : { status }) }, { signal }));
  useEffect(() => {
    setData(null); setRevokeTarget(null); setPendingId(null); setNotice(""); setActionError("");
  }, [generation]);
  useEffect(() => {
    setLoading(members.isLoading || members.isRefreshing);
    setData(members.data ?? null);
    setLoadError(members.error instanceof Error ? members.error.message : members.error ? "Members could not be loaded. Try again." : "");
    if (members.data && !members.data.items.length && page > 1) setPage(Math.max(1, Math.ceil(members.data.total / pageSize)));
  }, [members.data, members.error, members.isLoading, members.isRefreshing, page]);

  async function mutate(member: MemberRecord, action: MemberMutationInput) {
    if (pendingId) return;
    const epoch = store.generation;
    setPendingId(member.id);
    setActionError("");
    setNotice("");
    try {
      const updated = await api.members.update(member.id, action);
      if (!store.isCurrent(epoch)) return;
      invalidate(["members", "roles", "assignees", "identity"]);
      setRevokeTarget(null);
      if (updated.id === currentUserId && updated.status === "revoked") {
        clear();
        try { await authClient.signOut(); } catch { /* Revocation already invalidated this account's sessions. */ }
        window.location.assign("/access-revoked");
        return;
      }
      if (updated.id === currentUserId) await refreshAccount();
      setNotice(action.action === "revoke" ? "Access revoked. This account has been signed out." : action.action === "restore" ? "Access restored with no role. This account must sign in again and be assigned a role." : "Member role updated.");
      setRevision((value) => value + 1);
    } catch (error) {
      if (!store.isCurrent(epoch)) return;
      setActionError(error instanceof ApiError ? error.message : "The change could not be saved. Check your connection and try again.");
      if (error instanceof ApiError && [404, 409].includes(error.status)) {
        setRevokeTarget(null);
        setRevision((value) => value + 1);
      }
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      if (store.isCurrent(epoch)) setPendingId(null);
    }
  }

  const disabled = loading || pendingId !== null;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6">
        <div className="space-y-2">
          <Button asChild variant="link" className="min-h-11 px-0"><Link href="/settings">Back to settings</Link></Button>
          <h1 className="text-2xl font-medium tracking-tight md:text-3xl">Members</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Everyone with active access shares the CRM workspace. System accounts manage roles and access. At least one active system account must remain.</p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Label htmlFor="member-status">Access status</Label>
            <select id="member-status" name="status" value={status} disabled={disabled} onChange={(event) => {
              setStatus(event.target.value as typeof status);
              setPage(1);
              setNotice("");
            }} className="block min-h-11 rounded-md border border-input bg-control px-3 text-base text-foreground hover:border-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 md:text-sm">
              <option value="all">All members</option><option value="active">Active</option><option value="revoked">Revoked</option>
            </select>
          </div>
          <Button variant="outline" className="min-h-11" disabled={disabled} onClick={() => { invalidate(["members"]); setRevision((value) => value + 1); }}>Refresh members</Button>
        </div>
        {!!roles.error && <p role="alert" className="text-sm text-destructive">Roles could not load. <button className="underline" onClick={roles.refresh}>Retry roles</button></p>}
        {notice && <p role="status" className="rounded-md border bg-muted p-3 text-sm">{notice}</p>}
        {actionError && !revokeTarget && <p ref={errorRef} role="alert" tabIndex={-1} className="rounded-sm text-sm text-destructive focus:outline-none focus:ring-2 focus:ring-ring">{actionError}</p>}
        <section aria-label="Workspace members" aria-busy={loading} className="rounded-lg border bg-card text-card-foreground">
          {loading && <p role="status" className="p-6 text-sm text-muted-foreground">Loading members…</p>}
          {loadError && <div className="space-y-3 p-6"><p role="alert" className="text-sm text-destructive">{loadError}</p><Button variant="outline" className="min-h-11" onClick={() => { invalidate(["members"]); setRevision((value) => value + 1); }}>Try again</Button></div>}
          {!loading && data && data.items.length === 0 && <p className="p-6 text-sm text-muted-foreground">No members match this access status.</p>}
          {!loading && data && data.items.length > 0 && <ul className="divide-y">
            {data.items.map((member) => <li key={member.id} className="flex min-w-0 flex-col gap-4 p-4 lg:flex-row lg:items-center lg:p-6">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="break-words text-sm font-medium">{member.name}{member.id === currentUserId && <span className="ml-2 font-normal text-muted-foreground">(you)</span>}</p>
                <p className="break-all text-sm text-muted-foreground">{member.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:w-36 lg:shrink-0">
                <Badge variant="outline">{member.role?.name ?? "No role"}</Badge>
                <Badge variant={member.status === "revoked" ? "destructive" : "secondary"}>{member.status === "active" ? "Active" : "Revoked"}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:w-64 lg:shrink-0 lg:justify-end">
                {member.status === "active" ? <>
                  <select aria-label={`Role for ${member.name}`} value={member.roleId ?? ""} disabled={disabled || roles.loading || !!roles.error} className="min-h-11 max-w-full rounded-md border bg-control px-3 text-sm" onChange={event => void mutate(member, { action: "change-role", roleId: event.target.value || null, expectedRevision: member.revision })}>
                    <option value="">No role</option>{roles.data?.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                  <Button variant="outline" className="min-h-11 text-destructive" disabled={disabled} aria-label={`Revoke access for ${member.name}`} onClick={() => { setActionError(""); setRevokeTarget(member); }}>Revoke access</Button>
                </> : <Button variant="outline" className="min-h-11" disabled={disabled} aria-label={`Restore access for ${member.name}`} onClick={() => mutate(member, { action: "restore", expectedRevision: member.revision })}>{pendingId === member.id ? "Restoring…" : "Restore access"}</Button>}
              </div>
            </li>)}
          </ul>}
        </section>
        {data && <nav aria-label="Members pagination" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm tabular-nums text-muted-foreground">Page {page} of {totalPages} · {data.total} {data.total === 1 ? "member" : "members"}</p>
          <div className="flex gap-2"><Button variant="outline" className="min-h-11" disabled={disabled || page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="outline" className="min-h-11" disabled={disabled || page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
        </nav>}
      </div>
      <Dialog open={revokeTarget !== null} onOpenChange={(open) => { if (!open && !pendingId) { setRevokeTarget(null); setActionError(""); } }}>
        <DialogContent className="w-[calc(100%_-_2rem)] rounded-lg [&>button:last-child]:size-11 [&>button:last-child]:right-1 [&>button:last-child]:top-1 [&>button:last-child]:flex [&>button:last-child]:items-center [&>button:last-child]:justify-center" onEscapeKeyDown={(event) => { if (pendingId) event.preventDefault(); }} onPointerDownOutside={(event) => { if (pendingId) event.preventDefault(); }}>
          <DialogTitle>Revoke workspace access?</DialogTitle>
          <DialogDescription className="break-words leading-relaxed">{revokeTarget?.name} will be signed out and lose access to the shared workspace. Their CRM records and history will remain. A system account can restore access later.</DialogDescription>
          {revokeTarget?.id === currentUserId && <p className="text-sm">You are revoking your own access. Another system account will need to restore it.</p>}
          {actionError && <p ref={errorRef} role="alert" tabIndex={-1} className="text-sm text-destructive focus:outline-none focus:ring-2 focus:ring-ring">{actionError}</p>}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="min-h-11" disabled={pendingId !== null} onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button variant="destructive" className="min-h-11" disabled={pendingId !== null} onClick={() => { if (revokeTarget) void mutate(revokeTarget, { action: "revoke", expectedRevision: revokeTarget.revision }); }}>{pendingId ? "Revoking…" : "Revoke access"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
