"use client";
import { canPermission } from "@/lib/auth/permissions";
import { useCallback, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppData, useAppQuery } from "../app-data-provider";
import { useAssigneeDirectory } from "../records/use-assignee-directory";
import { RECORD_INVALIDATIONS } from "../records/form-values";
import { StageChangeDialog, stageLabel } from "../records/stage-change";
import { PropertyPanel, type SheetProps } from "./property-panel";
import { RecordActions } from "./record-actions";
import { RelatedRecords, DealContacts } from "./related-records";
import type { DirtyEditor } from "./inline-field";
export function DealSheet({ id, onOpen, onDirtyChange }: SheetProps) {
  const { api, invalidate, store, generation, account } = useAppData();
  const result = useAppQuery("deal", { id }, signal => api.deals.get(id, { signal }));
  const directory = useAssigneeDirectory();
  const [stageOpen, setStageOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const stageDirty = useCallback((state: DirtyEditor | null) => onDirtyChange(`deal:${id}:stage`, state), [id, onDirtyChange]);
  const deal = result.data;
  return <div className="space-y-6" data-record-kind="deal">
    {result.loading && <div role="status" aria-busy="true" aria-label="Loading deal" className="space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>}
    {!!result.error && <div role="alert"><p>{result.error instanceof ApiError && result.error.status === 404 ? "Deal not found." : result.error instanceof Error ? result.error.message : "Could not load deal."}</p><button className="underline" onClick={result.refresh}>Retry deal</button></div>}
    {deal && <>
      <div><h2 className="break-words text-xl font-semibold">{deal.name}</h2>{result.refreshing && <p role="status" className="text-xs text-muted-foreground">Refreshing deal…</p>}</div>
      <RecordActions entity="deal" id={id} archivedAt={deal.archivedAt} />
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">Stage: {stageLabel(deal.stage)}</span>{canPermission(account, "deal", "update") && <Button size="sm" variant="outline" onClick={() => setStageOpen(true)}>Change stage</Button>}</div>
      <StageChangeDialog open={stageOpen} onOpenChange={setStageOpen} count={1} pending={pending} initialStage={deal.stage} onDirtyChange={stageDirty} onSubmit={async (stage, reason) => {
        if (busy.current) return; busy.current = true; setPending(true);
        try { await api.deals.setStage(id, { stage, reason }); if (store.isCurrent(generation)) { invalidate(RECORD_INVALIDATIONS); setStageOpen(false); } }
        finally { busy.current = false; if (store.isCurrent(generation)) setPending(false); }
      }} />
      <PropertyPanel entity="deal" record={deal} onDirtyChange={onDirtyChange} relationLabels={{
        ...(deal.company ? { companyId: deal.company.name } : {}),
        ...(directory.data?.find(owner => owner.id === deal.ownerId) ? { ownerId: directory.data.find(owner => owner.id === deal.ownerId)!.name } : {}),
      }} />
      {!!directory.error && <p role="alert" className="text-xs">Owner directory unavailable. <button className="underline" onClick={directory.refresh}>Retry directory</button></p>}
      <RelatedRecords title="Company" kind="company" records={deal.company ? [deal.company] : []} onOpen={onOpen} />
      <DealContacts dealId={id} contacts={deal.contacts} onOpen={onOpen} onDirtyChange={onDirtyChange} />
    </>}
  </div>;
}
