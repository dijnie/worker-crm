"use client";
import { useEffect, useRef, useState } from "react";
import type { DirtyEditor } from "../record-sheet/inline-field";
import { propertyError } from "../record-sheet/property-values";
import { DEAL_STAGES, type DealStage } from "@/lib/db/schema/constants";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { selectClass } from "./record-picker";
export function stageLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part, index) =>
      index ? part : part[0].toUpperCase() + part.slice(1),
    )
    .join(" ");
}
export function StageChangeDialog({
  open,
  onOpenChange,
  count,
  onSubmit,
  pending,
  onDirtyChange,
  initialStage = "DEMO_BOOKED",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onSubmit: (stage: DealStage, reason?: string) => Promise<void>;
  pending: boolean;
  onDirtyChange?: (state: DirtyEditor | null) => void;
  initialStage?: DealStage;
}) {
  const [stage, setStage] = useState<DealStage>(initialStage);
  const [reason, setReason] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState("");
  const flight = useRef<Promise<boolean> | null>(null);
  const openedStage = useRef(initialStage);
  useEffect(() => { if (open) { openedStage.current = initialStage; setStage(initialStage); setReason(""); setError(""); setConfirmClose(false); } }, [open]);
  const save = (): Promise<boolean> => {
    if (flight.current) return flight.current;
    if ((stage === "CLOSED_LOST" || stage === "UNQUALIFIED_TO_BUY") && !reason.trim()) { setError("A lost deal needs a reason."); return Promise.resolve(false); }
    if (reason.trim().length > 100000) { setError("Reason must be at most 100000 characters."); return Promise.resolve(false); }
    setError("");
    flight.current = onSubmit(stage, reason.trim() || undefined).then(() => true).catch(failure => { setError(propertyError(failure)); return false; }).finally(() => { flight.current = null; });
    return flight.current;
  };
  const latestSave = useRef(save); latestSave.current = save;
  const dirty = open && (stage !== openedStage.current || !!reason || pending);
  useEffect(() => {
    onDirtyChange?.(dirty ? { dirty: true, pending, save: () => latestSave.current(), discard: () => { setStage(openedStage.current); setReason(""); setError(""); onOpenChange(false); } } : null);
    return () => onDirtyChange?.(null);
  }, [dirty, pending, onDirtyChange]);
  const losing = stage === "CLOSED_LOST" || stage === "UNQUALIFIED_TO_BUY";
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (pending || flight.current) return;
        if (!value && dirty) setConfirmClose(true); else onOpenChange(value);
      }}
    >
      <DialogContent>
        <DialogTitle>Change stage</DialogTitle>
        <DialogDescription>
          Update {count} selected {count === 1 ? "deal" : "deals"}. Each
          transition is recorded in its activity history.
        </DialogDescription>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            await save();
          }}
        >
          <label className="block space-y-2">
            <span>Stage</span>
            <select
              aria-label="Stage"
              className={selectClass}
              value={stage}
              disabled={pending}
              onChange={(event) => setStage(event.target.value as DealStage)}
            >
              {DEAL_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stageLabel(stage)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2">
            <span>Reason{losing ? " *" : " (optional)"}</span>
            <Textarea
              aria-label="Reason"
              required={losing}
              value={reason}
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            disabled={pending || (losing && !reason.trim())}
          >
            {pending ? "Updating…" : "Update stage"}
          </Button>
        </form>
        {confirmClose && <div role="alert" className="space-y-3 rounded border p-3"><p>Save the stage change before closing?</p><div className="flex gap-2">
          <Button disabled={pending} onClick={async () => { if (await save()) onOpenChange(false); }}>Save and close</Button>
          <Button variant="outline" disabled={pending} onClick={() => { setStage(openedStage.current); setReason(""); onOpenChange(false); }}>Discard</Button>
          <Button variant="ghost" disabled={pending} onClick={() => setConfirmClose(false)}>Stay</Button>
        </div></div>}
      </DialogContent>
    </Dialog>
  );
}
