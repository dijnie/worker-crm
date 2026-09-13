"use client";
import { useState } from "react";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onSubmit: (stage: DealStage, reason?: string) => Promise<void>;
  pending: boolean;
}) {
  const [stage, setStage] = useState<DealStage>("DEMO_BOOKED");
  const [reason, setReason] = useState("");
  const losing = stage === "CLOSED_LOST" || stage === "UNQUALIFIED_TO_BUY";
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) onOpenChange(value);
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
            await onSubmit(stage, reason.trim() || undefined);
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
          <Button
            type="submit"
            disabled={pending || (losing && !reason.trim())}
          >
            {pending ? "Updating…" : "Update stage"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
