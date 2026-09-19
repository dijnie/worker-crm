"use client";
import { canPermission } from "@/lib/auth/permissions";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DealStage } from "@/lib/db/schema/constants";
import { useAppData } from "../app-data-provider";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/i18n/error-message";
import { useDictionary } from "../i18n-provider";
import { RecordPicker } from "./record-picker";
import { StageChangeDialog } from "./stage-change";
import { runBulkOperation, type BulkOutcome } from "./bulk-operations";
import { RECORD_INVALIDATIONS, recordEntityKey, type RecordEntity } from "./form-values";
export interface BulkTarget {
  id: string;
  name: string;
}
export interface BulkReport {
  outcomes: BulkOutcome[];
  names: Record<string, string>;
}
/** Bulk results report their own outcome; the selection bar is too short to hold them. */
export function BulkReportView({ report }: { report: BulkReport }) {
  const { recordSheet: dictionary } = useDictionary();
  const failed = report.outcomes.filter((item) => !item.ok);
  return (
    <div role="status" className="rounded-md border bg-card p-3 text-xs">
      <p>
        {dictionary.bulk.reportSummary(report.outcomes.length - failed.length, failed.length)}
      </p>
      {failed.map((item) => (
        <p key={item.id} className="text-destructive">
          {report.names[item.id] ?? item.id}:{" "}
          {item.status ? `${item.status} — ` : ""}
          {item.error}
        </p>
      ))}
      {failed.length > 0 && (
        <p>{dictionary.bulk.failedRetryHint}</p>
      )}
    </div>
  );
}
export function BulkActions({
  entity,
  targets,
  archived,
  disabled,
  retainFailures,
  stageOnly = false,
  onReport,
}: {
  entity: RecordEntity;
  targets: BulkTarget[];
  archived: boolean;
  disabled: boolean;
  retainFailures: (ids: string[]) => void;
  stageOnly?: boolean;
  /** Set by the list surface, which renders the report beside the table. */
  onReport?: (report: BulkReport | null) => void;
}) {
  const { api, generation, store, invalidate, account } = useAppData();
  const dictionary = useDictionary();
  const { bulk: copy } = dictionary.recordSheet;
  const entityLower = dictionary.crm.entities[recordEntityKey(entity)].lower;
  const [action, setAction] = useState<
    "owner" | "company" | "stage" | "archive" | "restore" | null
  >(null);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [report, setReport] = useState<BulkReport | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const targetKey = targets.map((target) => target.id).join("\u0000");
  useEffect(() => {
    setAction(null);
    setValue("");
  }, [targetKey, archived]);
  useEffect(() => {
    setAction(null);
    setValue("");
    setPending(false);
    setReport(null);
    onReport?.(null);
  }, [generation]);
  async function execute(operation: (id: string) => Promise<unknown>) {
    if (busy.current || disabled || !targets.length) return;
    busy.current = true;
    setPending(true);
    setReport(null);
    onReport?.(null);
    const names = Object.fromEntries(
      targets.map((target) => [target.id, target.name]),
    );
    try {
      const results = await runBulkOperation(
        targets.map((target) => target.id),
        operation,
        {
          isCurrent: () => store.isCurrent(generation),
          strings: { stopped: copy.stoppedAccessChanged, accessChanged: copy.accessChangedRetry, operationFailed: copy.operationFailed },
          describe: failure => failure instanceof ApiError ? errorMessage(failure, dictionary) : copy.operationFailed,
        },
      );
      if (mounted.current && store.isCurrent(generation)) {
        if (results.some((result) => result.ok)) invalidate(RECORD_INVALIDATIONS);
        const next = { outcomes: results, names };
        setReport(next);
        onReport?.(next);
        retainFailures(
          results.filter((result) => !result.ok).map((result) => result.id),
        );
        setAction(null);
      }
    } finally {
      busy.current = false;
      if (mounted.current && store.isCurrent(generation)) setPending(false);
    }
  }
  const resource =
    api[
      entity === "company"
        ? "companies"
        : entity === "contact"
          ? "contacts"
          : "deals"
    ];
  const run = () =>
    execute((id) =>
      action === "owner"
        ? entity === "deal"
          ? api.deals.update(id, { ownerId: value })
          : entity === "company"
            ? api.companies.update(id, { ownerId: value || null })
            : api.contacts.update(id, { ownerId: value || null })
        : action === "company"
          ? api.contacts.update(id, { companyId: value || null })
          : action === "restore"
            ? resource.restore(id)
            : resource.archive(id),
    );
  const stage = (stage: DealStage, reason?: string) =>
    execute((id) => api.deals.setStage(id, { stage, reason }));
  const canUpdate = canPermission(account, entity, "update");
  const canArchive = canPermission(account, entity, archived ? "restore" : "archive");
  if (stageOnly && !canUpdate || !canUpdate && !canArchive) return null;
  const blocked = disabled || pending || !targets.length;
  return (
    <>
      {stageOnly ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={blocked}
          onClick={() => setAction("stage")}
        >
          {dictionary.recordSheet.common.changeStage}
        </Button>
      ) : targets.length > 0 ? (
        <>
          {canUpdate && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={blocked}
              onClick={() => {
                setValue("");
                setAction("owner");
              }}
            >
              {copy.assignOwner}
            </Button>
          )}
          {canUpdate &&
            canPermission(account, "company", "read") &&
            entity === "contact" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={blocked}
                onClick={() => {
                  setValue("");
                  setAction("company");
                }}
              >
                {copy.assignCompany}
              </Button>
            )}
          {canUpdate && entity === "deal" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={blocked}
              onClick={() => setAction("stage")}
            >
              {dictionary.recordSheet.common.changeStage}
            </Button>
          )}
          {canArchive && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={blocked}
              onClick={() => setAction(archived ? "restore" : "archive")}
            >
              {archived ? copy.restoreSelected : copy.archiveSelected}
            </Button>
          )}
        </>
      ) : null}
      {!onReport && report && <BulkReportView report={report} />}
      <StageChangeDialog
        key={generation}
        open={action === "stage"}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        count={targets.length}
        onSubmit={stage}
        pending={pending || disabled}
      />
      <Dialog
        open={action !== null && action !== "stage"}
        onOpenChange={(open) => {
          if (!open && !pending) setAction(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {action === "owner"
              ? copy.dialogTitle.owner
              : action === "company"
                ? copy.dialogTitle.company
                : action === "restore"
                  ? copy.dialogTitle.restore
                  : copy.dialogTitle.archive}
          </DialogTitle>
          <DialogDescription>
            {copy.applyTo(
              targets.length,
              entityLower,
              targets.slice(0, 5).map((target) => target.name).join(", "),
              targets.length > 5,
            )}
          </DialogDescription>
          {action === "owner" || action === "company" ? (
            <RecordPicker
              kind={action}
              label={action === "owner" ? copy.ownerLabel : dictionary.crm.entities.COMPANY.singular}
              value={value}
              onChange={setValue}
              required={entity === "deal" && action === "owner"}
              disabled={pending}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              {action === "restore"
                ? copy.restoreDescription
                : copy.archiveDescription}
            </p>
          )}
          <Button
            type="button"
            disabled={
              blocked || (entity === "deal" && action === "owner" && !value)
            }
            onClick={run}
          >
            {pending
              ? copy.working
              : action === "owner" || action === "company"
                ? copy.applyAssignment
                : action === "restore"
                  ? copy.restore
                  : copy.archive}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
