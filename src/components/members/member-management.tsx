"use client";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SimpleTable,
  SimpleTableRow,
  type SimpleTableColumn,
} from "@/components/ui/simple-table";
import { TableCell } from "@/components/ui/table";
import { useAppData, useAppQuery } from "@/components/app/app-data-provider";
import {
  PageShell,
  PageShellContent,
  PageShellDescription,
  PageShellHeader,
  PageShellHeading,
  PageShellTitle,
} from "@/components/app/page-shell";
import { selectClass } from "@/components/app/records/record-picker";
import { ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth/auth-client";
import type { MemberMutationInput, MemberRecord } from "@services/member.service";
import type { Page } from "@/lib/utils/validation";
import { useEffect, useRef, useState } from "react";

const pageSize = 20;

const columns: SimpleTableColumn[] = [
  { id: "name", header: "Name", width: "w-[34%]" },
  { id: "email", header: "Email", width: "w-[28%]", className: "hidden md:table-cell" },
  { id: "role", header: "Role", width: "w-[14%]" },
  { id: "status", header: "Status", width: "w-[12%]" },
  { id: "actions", srLabel: "Actions", align: "right", width: "w-[12%]" },
];

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
  const errorRef = useRef<HTMLDivElement>(null);

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
  const refresh = () => { invalidate(["members"]); setRevision((value) => value + 1); };
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <PageShell>
      <PageShellHeader>
        <PageShellHeading>
          <PageShellTitle>Members</PageShellTitle>
          <PageShellDescription>
            Everyone with active access shares the CRM workspace. System accounts manage roles and access. At least one active system account must remain.
          </PageShellDescription>
        </PageShellHeading>
      </PageShellHeader>

      <PageShellContent>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Field className="max-w-56">
            <FieldLabel htmlFor="member-status">Access status</FieldLabel>
            <select
              id="member-status"
              name="status"
              value={status}
              disabled={disabled}
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
                setPage(1);
                setNotice("");
              }}
              className={selectClass}
            >
              <option value="all">All members</option>
              <option value="active">Active</option>
              <option value="revoked">Revoked</option>
            </select>
          </Field>
          <Button variant="outline" disabled={disabled} onClick={refresh}>Refresh members</Button>
        </div>

        {!!roles.error && <Alert variant="destructive">
          Roles could not load.{" "}
          <Button variant="link" className="h-auto px-0" onClick={roles.refresh}>Retry roles</Button>
        </Alert>}
        {notice && <Alert role="status">{notice}</Alert>}
        {actionError && !revokeTarget && <Alert variant="destructive" ref={errorRef} tabIndex={-1}>{actionError}</Alert>}

        <section aria-label="Workspace members" aria-busy={loading} className="flex flex-col gap-3">
          {loading && <CardContent role="status" aria-label="Loading members" className="gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex min-w-0 items-center gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </CardContent>}
          {loadError && <CardContent className="items-start gap-3">
            <Alert variant="destructive">{loadError}</Alert>
            <Button variant="outline" onClick={refresh}>Try again</Button>
          </CardContent>}
          {!loading && data && data.items.length === 0 && <CardContent className="text-xs text-muted-foreground">No members match this access status.</CardContent>}
          {!loading && data && data.items.length > 0 && <SimpleTable columns={columns}>
            {data.items.map((member) => <SimpleTableRow key={member.id}>
              <TableCell className="whitespace-normal">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate font-medium">{member.name}</span>
                  {member.id === currentUserId && <span className="text-xs text-muted-foreground">(you)</span>}
                </span>
              </TableCell>
              <TableCell className="hidden whitespace-normal break-all text-muted-foreground md:table-cell">{member.email}</TableCell>
              <TableCell><Badge variant="outline">{member.role?.name ?? "No role"}</Badge></TableCell>
              <TableCell><Badge variant={member.status === "revoked" ? "destructive" : "secondary"}>{member.status === "active" ? "Active" : "Revoked"}</Badge></TableCell>
              <TableCell className="text-right">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {member.status === "active" ? <>
                    <select
                      aria-label={`Role for ${member.name}`}
                      value={member.roleId ?? ""}
                      disabled={disabled || roles.loading || !!roles.error}
                      className={`${selectClass} w-36`}
                      onChange={event => void mutate(member, { action: "change-role", roleId: event.target.value || null, expectedRevision: member.revision })}
                    >
                      <option value="">No role</option>
                      {roles.data?.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                    </select>
                    <Button
                      variant="outline"
                      className="text-destructive"
                      disabled={disabled}
                      aria-label={`Revoke access for ${member.name}`}
                      onClick={() => { setActionError(""); setRevokeTarget(member); }}
                    >
                      Revoke access
                    </Button>
                  </> : <Button
                    variant="outline"
                    disabled={disabled}
                    aria-label={`Restore access for ${member.name}`}
                    onClick={() => mutate(member, { action: "restore", expectedRevision: member.revision })}
                  >
                    {pendingId === member.id ? "Restoring…" : "Restore access"}
                  </Button>}
                </div>
              </TableCell>
            </SimpleTableRow>)}
          </SimpleTable>}
        </section>

        {data && <nav aria-label="Members pagination" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs tabular-nums text-muted-foreground">Page {page} of {totalPages} · {data.total} {data.total === 1 ? "member" : "members"}</p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={disabled || page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
            <Button variant="outline" disabled={disabled || page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button>
          </div>
        </nav>}
      </PageShellContent>

      <Dialog open={revokeTarget !== null} onOpenChange={(open) => { if (!open && !pendingId) { setRevokeTarget(null); setActionError(""); } }}>
        <DialogContent
          onEscapeKeyDown={(event) => { if (pendingId) event.preventDefault(); }}
          onPointerDownOutside={(event) => { if (pendingId) event.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>Revoke workspace access?</DialogTitle>
            <DialogDescription className="break-words text-pretty">
              {revokeTarget?.name} will be signed out and lose access to the shared workspace. Their CRM records and history will remain. A system account can restore access later.
            </DialogDescription>
          </DialogHeader>
          {revokeTarget?.id === currentUserId && <p className="text-xs">You are revoking your own access. Another system account will need to restore it.</p>}
          {actionError && <Alert variant="destructive" ref={errorRef} tabIndex={-1}>{actionError}</Alert>}
          <DialogFooter>
            <Button variant="outline" disabled={pendingId !== null} onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={pendingId !== null}
              onClick={() => { if (revokeTarget) void mutate(revokeTarget, { action: "revoke", expectedRevision: revokeTarget.revision }); }}
            >
              {pendingId ? "Revoking…" : "Revoke access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
