"use client";
import { canPermission } from "@/lib/auth/permissions";
import { useCallback, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyCellValue } from "@/components/ui/empty-cell";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppData, useAppQuery } from "../app-data-provider";
import { useAssigneeDirectory } from "../records/use-assignee-directory";
import { RECORD_INVALIDATIONS } from "../records/form-values";
import { StageChangeDialog, stageLabel } from "../records/stage-change";
import { DetailSheetBody, DetailSheetSection, DetailSheetStat, DetailSheetStats } from "../detail-sheet";
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
  const owner = directory.data?.find(owner => owner.id === deal?.ownerId);
  return <DetailSheetBody data-record-kind="deal">
    {result.loading && <div role="status" aria-busy="true" aria-label="Loading deal" className="space-y-3 px-5 py-4">
      <Skeleton className="h-8 w-56 max-w-full" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>}
    {!!result.error && <div role="alert" className="space-y-2 px-5 py-4 text-destructive text-xs">
      <p>{result.error instanceof ApiError && result.error.status === 404 ? "Deal not found." : result.error instanceof Error ? result.error.message : "Could not load deal."}</p>
      <button type="button" className="underline" onClick={result.refresh}>Retry deal</button>
    </div>}
    {deal && <>
      <DetailSheetSection className="py-4">
        <h2 className="wrap-anywhere font-medium text-xl tracking-tight">{deal.name}</h2>
        {result.refreshing && <p role="status" className="text-muted-foreground text-xs">Refreshing deal…</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <RecordActions entity="deal" id={id} archivedAt={deal.archivedAt} />
          {canPermission(account, "deal", "update") && <Button size="sm" variant="outline-ghost" onClick={() => setStageOpen(true)}>Change stage</Button>}
        </div>
      </DetailSheetSection>
      <DetailSheetStats>
        <DetailSheetStat label="Stage">{stageLabel(deal.stage)}</DetailSheetStat>
        <DetailSheetStat label="Amount"><span className="tabular-nums">{deal.amount ? `${deal.amount} ${deal.currency}` : <EmptyCellValue />}</span></DetailSheetStat>
        <DetailSheetStat label="Close date">{deal.expectedCloseDate ? deal.expectedCloseDate.slice(0, 10) : <EmptyCellValue />}</DetailSheetStat>
        <DetailSheetStat label="Owner">{owner?.name ?? <span className="text-muted-foreground">Unassigned</span>}</DetailSheetStat>
      </DetailSheetStats>
      <PropertyPanel entity="deal" record={deal} onDirtyChange={onDirtyChange} relationLabels={{
        ...(deal.company ? { companyId: deal.company.name } : {}),
        ...(owner ? { ownerId: owner.name } : {}),
      }} />
      {!!directory.error && <DetailSheetSection><p role="alert" className="text-destructive text-xs">Owner directory unavailable. <button type="button" className="underline" onClick={directory.refresh}>Retry directory</button></p></DetailSheetSection>}
      <RelatedRecords title="Company" kind="company" records={deal.company ? [deal.company] : []} onOpen={onOpen} />
      <DealContacts dealId={id} contacts={deal.contacts} onOpen={onOpen} onDirtyChange={onDirtyChange} />
      <StageChangeDialog open={stageOpen} onOpenChange={setStageOpen} count={1} pending={pending} initialStage={deal.stage} onDirtyChange={stageDirty} onSubmit={async (stage, reason) => {
        if (busy.current) return; busy.current = true; setPending(true);
        try { await api.deals.setStage(id, { stage, reason }); if (store.isCurrent(generation)) { invalidate(RECORD_INVALIDATIONS); setStageOpen(false); } }
        finally { busy.current = false; if (store.isCurrent(generation)) setPending(false); }
      }} />
    </>}
  </DetailSheetBody>;
}
