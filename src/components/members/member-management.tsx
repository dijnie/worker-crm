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
import { useDictionary } from "@/components/app/i18n-provider";
import { ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth/auth-client";
import { errorMessage } from "@/lib/i18n/error-message";
import type { MemberMutationInput, MemberRecord } from "@services/member.service";
import type { Page } from "@/lib/utils/validation";
import { useEffect, useRef, useState } from "react";

const pageSize = 20;

export function MemberManagement({ currentUserId }: { currentUserId: string }) {
  const { api, store, generation, invalidate, clear, refreshAccount } = useAppData();
  const dictionary = useDictionary();
  const copy = dictionary.access.members;
  const columns: SimpleTableColumn[] = [
    { id: "name", header: copy.nameHeader, width: "w-[34%]" },
    { id: "email", header: copy.emailHeader, width: "w-[28%]", className: "hidden md:table-cell" },
    { id: "role", header: copy.roleHeader, width: "w-[14%]" },
    { id: "status", header: copy.statusHeader, width: "w-[12%]" },
    { id: "actions", srLabel: copy.actionsHeader, align: "right", width: "w-[12%]" },
  ];
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
    setLoadError(members.error instanceof ApiError ? errorMessage(members.error, dictionary) : members.error ? copy.loadFailed : "");
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
      setNotice(action.action === "revoke" ? copy.accessRevokedNotice : action.action === "restore" ? copy.accessRestoredNotice : copy.roleUpdatedNotice);
      setRevision((value) => value + 1);
    } catch (error) {
      if (!store.isCurrent(epoch)) return;
      setActionError(error instanceof ApiError ? errorMessage(error, dictionary) : copy.changeFailed);
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
          <PageShellTitle>{copy.title}</PageShellTitle>
          <PageShellDescription>
            {copy.description}
          </PageShellDescription>
        </PageShellHeading>
      </PageShellHeader>

      <PageShellContent>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Field className="max-w-56">
            <FieldLabel htmlFor="member-status">{copy.accessStatusLabel}</FieldLabel>
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
              <option value="all">{copy.statusAll}</option>
              <option value="active">{copy.statusActive}</option>
              <option value="revoked">{copy.statusRevoked}</option>
            </select>
          </Field>
          <Button variant="outline" disabled={disabled} onClick={refresh}>{copy.refresh}</Button>
        </div>

        {!!roles.error && <Alert variant="destructive">
          {copy.rolesUnavailable}{" "}
          <Button variant="link" className="h-auto px-0" onClick={roles.refresh}>{copy.retryRoles}</Button>
        </Alert>}
        {notice && <Alert role="status">{notice}</Alert>}
        {actionError && !revokeTarget && <Alert variant="destructive" ref={errorRef} tabIndex={-1}>{actionError}</Alert>}

        <section aria-label={copy.workspaceMembersLabel} aria-busy={loading} className="flex flex-col gap-3">
          {loading && <CardContent role="status" aria-label={copy.loadingLabel} className="gap-3">
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
            <Button variant="outline" onClick={refresh}>{copy.tryAgain}</Button>
          </CardContent>}
          {!loading && data && data.items.length === 0 && <CardContent className="text-xs text-muted-foreground">{copy.empty}</CardContent>}
          {!loading && data && data.items.length > 0 && <SimpleTable columns={columns}>
            {data.items.map((member) => <SimpleTableRow key={member.id}>
              <TableCell className="whitespace-normal">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate font-medium">{member.name}</span>
                  {member.id === currentUserId && <span className="text-xs text-muted-foreground">{copy.you}</span>}
                </span>
              </TableCell>
              <TableCell className="hidden whitespace-normal break-all text-muted-foreground md:table-cell">{member.email}</TableCell>
              <TableCell><Badge variant="outline">{member.role?.name ?? copy.noRole}</Badge></TableCell>
              <TableCell><Badge variant={member.status === "revoked" ? "destructive" : "secondary"}>{member.status === "active" ? copy.statusActiveBadge : copy.statusRevokedBadge}</Badge></TableCell>
              <TableCell className="text-right">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {member.status === "active" ? <>
                    <select
                      aria-label={copy.roleForAria(member.name)}
                      value={member.roleId ?? ""}
                      disabled={disabled || roles.loading || !!roles.error}
                      className={`${selectClass} w-36`}
                      onChange={event => void mutate(member, { action: "change-role", roleId: event.target.value || null, expectedRevision: member.revision })}
                    >
                      <option value="">{copy.noRole}</option>
                      {roles.data?.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                    </select>
                    <Button
                      variant="outline"
                      className="text-destructive"
                      disabled={disabled}
                      aria-label={copy.revokeAccessForAria(member.name)}
                      onClick={() => { setActionError(""); setRevokeTarget(member); }}
                    >
                      {copy.revokeAccess}
                    </Button>
                  </> : <Button
                    variant="outline"
                    disabled={disabled}
                    aria-label={copy.restoreAccessForAria(member.name)}
                    onClick={() => mutate(member, { action: "restore", expectedRevision: member.revision })}
                  >
                    {pendingId === member.id ? copy.restoring : copy.restoreAccess}
                  </Button>}
                </div>
              </TableCell>
            </SimpleTableRow>)}
          </SimpleTable>}
        </section>

        {data && <nav aria-label={copy.paginationLabel} className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs tabular-nums text-muted-foreground">{copy.paginationSummary(page, totalPages, data.total)}</p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={disabled || page <= 1} onClick={() => setPage((value) => value - 1)}>{copy.previous}</Button>
            <Button variant="outline" disabled={disabled || page >= totalPages} onClick={() => setPage((value) => value + 1)}>{copy.next}</Button>
          </div>
        </nav>}
      </PageShellContent>

      <Dialog open={revokeTarget !== null} onOpenChange={(open) => { if (!open && !pendingId) { setRevokeTarget(null); setActionError(""); } }}>
        <DialogContent
          onEscapeKeyDown={(event) => { if (pendingId) event.preventDefault(); }}
          onPointerDownOutside={(event) => { if (pendingId) event.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>{copy.revokeDialogTitle}</DialogTitle>
            <DialogDescription className="break-words text-pretty">
              {copy.revokeDialogDescription(revokeTarget?.name ?? "")}
            </DialogDescription>
          </DialogHeader>
          {revokeTarget?.id === currentUserId && <p className="text-xs">{copy.revokingSelf}</p>}
          {actionError && <Alert variant="destructive" ref={errorRef} tabIndex={-1}>{actionError}</Alert>}
          <DialogFooter>
            <Button variant="outline" disabled={pendingId !== null} onClick={() => setRevokeTarget(null)}>{dictionary.common.cancel}</Button>
            <Button
              variant="destructive"
              disabled={pendingId !== null}
              onClick={() => { if (revokeTarget) void mutate(revokeTarget, { action: "revoke", expectedRevision: revokeTarget.revision }); }}
            >
              {pendingId ? copy.revoking : copy.revokeAccess}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
