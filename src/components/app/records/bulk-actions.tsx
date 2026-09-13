"use client";
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
import { RecordPicker } from "./record-picker";
import { StageChangeDialog } from "./stage-change";
import { runBulkOperation, type BulkOutcome } from "./bulk-operations";
import { RECORD_INVALIDATIONS, type RecordEntity } from "./form-values";
export interface BulkTarget {
  id: string;
  name: string;
}
export function BulkActions({
  entity,
  targets,
  archived,
  disabled,
  retainFailures,
  stageOnly = false,
}: {
  entity: RecordEntity;
  targets: BulkTarget[];
  archived: boolean;
  disabled: boolean;
  retainFailures: (ids: string[]) => void;
  stageOnly?: boolean;
}) {
  const { api, generation, store, invalidate } = useAppData();
  const [action, setAction] = useState<
    "owner" | "company" | "stage" | "archive" | "restore" | null
  >(null);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [outcomes, setOutcomes] = useState<BulkOutcome[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
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
    setOutcomes([]);
    setNames({});
  }, [generation]);
  async function execute(operation: (id: string) => Promise<unknown>) {
    if (busy.current || disabled || !targets.length) return;
    busy.current = true;
    setPending(true);
    setOutcomes([]);
    setNames(
      Object.fromEntries(targets.map((target) => [target.id, target.name])),
    );
    try {
      const results = await runBulkOperation(
        targets.map((target) => target.id),
        operation,
        { isCurrent: () => store.isCurrent(generation) },
      );
      if (mounted.current && store.isCurrent(generation)) {
        if (results.some((result) => result.ok))
          invalidate(RECORD_INVALIDATIONS);
        setOutcomes(results);
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
  const blocked = disabled || pending || !targets.length;
  return (
    <div className="space-y-2">
      {stageOnly ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={blocked}
          onClick={() => setAction("stage")}
        >
          Change stage
        </Button>
      ) : targets.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {targets.length} selected on this page
          </span>
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
            Assign owner
          </Button>
          {entity === "contact" && (
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
              Assign company
            </Button>
          )}
          {entity === "deal" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={blocked}
              onClick={() => setAction("stage")}
            >
              Change stage
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={blocked}
            onClick={() => setAction(archived ? "restore" : "archive")}
          >
            {archived ? "Restore selected" : "Archive selected"}
          </Button>
        </div>
      ) : null}
      {outcomes.length > 0 && (
        <div role="status" className="rounded-md border p-3 text-sm">
          <p>
            {outcomes.filter((item) => item.ok).length} succeeded;{" "}
            {outcomes.filter((item) => !item.ok).length} failed.
          </p>
          {outcomes
            .filter((item) => !item.ok)
            .map((item) => (
              <p key={item.id} className="text-destructive">
                {names[item.id] ?? item.id}:{" "}
                {item.status ? `${item.status} — ` : ""}
                {item.error}
              </p>
            ))}
          {outcomes.some((item) => !item.ok) && (
            <p>
              Failed records remain selected. Choose the action again to retry.
            </p>
          )}
        </div>
      )}
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
              ? "Assign owner"
              : action === "company"
                ? "Assign company"
                : action === "restore"
                  ? "Restore records"
                  : "Archive records"}
          </DialogTitle>
          <DialogDescription>
            Apply to {targets.length} selected {entity}
            {targets.length === 1 ? "" : "s"}:{" "}
            {targets
              .slice(0, 5)
              .map((target) => target.name)
              .join(", ")}
            {targets.length > 5 ? "…" : ""}.
          </DialogDescription>
          {action === "owner" || action === "company" ? (
            <RecordPicker
              kind={action}
              label={action === "owner" ? "Owner" : "Company"}
              value={value}
              onChange={setValue}
              required={entity === "deal" && action === "owner"}
              disabled={pending}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {action === "restore"
                ? "Records will return to the active list."
                : "Records will move to the archived list and can be restored."}
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
              ? "Working…"
              : action === "owner" || action === "company"
                ? "Apply assignment"
                : action === "restore"
                  ? "Restore"
                  : "Archive"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
