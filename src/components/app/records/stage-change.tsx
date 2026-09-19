"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { DirtyEditor } from "../record-sheet/inline-field";
import { propertyFailureMessage } from "../record-sheet/property-values";
import { useDictionary } from "../i18n-provider";
import { DEAL_STAGES, type DealStage } from "@/lib/db/schema/constants";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { selectClass } from "./record-picker";
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
  const dictionary = useDictionary();
  const { stageChange: copy } = dictionary.recordSheet;
  const stageId = useId();
  const reasonId = useId();
  const [stage, setStage] = useState<DealStage>(initialStage);
  const [reason, setReason] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState("");
  const flight = useRef<Promise<boolean> | null>(null);
  const openedStage = useRef(initialStage);
  useEffect(() => { if (open) { openedStage.current = initialStage; setStage(initialStage); setReason(""); setError(""); setConfirmClose(false); } }, [open]);
  const save = (): Promise<boolean> => {
    if (flight.current) return flight.current;
    if ((stage === "CLOSED_LOST" || stage === "UNQUALIFIED_TO_BUY") && !reason.trim()) { setError(copy.lostReasonRequired); return Promise.resolve(false); }
    if (reason.trim().length > 100000) { setError(copy.reasonTooLong); return Promise.resolve(false); }
    setError("");
    flight.current = onSubmit(stage, reason.trim() || undefined).then(() => true).catch(failure => { setError(propertyFailureMessage(failure, dictionary)); return false; }).finally(() => { flight.current = null; });
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
      <DialogContent className="gap-4 sm:max-w-md">
        <DialogTitle>{dictionary.recordSheet.common.changeStage}</DialogTitle>
        <DialogDescription>
          {copy.description(count, count === 1 ? dictionary.crm.entities.DEAL.lower : dictionary.crm.entities.DEAL.lowerPlural)}
        </DialogDescription>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            await save();
          }}
        >
          <Field>
            <FieldLabel htmlFor={stageId}>{copy.stageLabel}</FieldLabel>
            <select
              id={stageId}
              aria-label={copy.stageLabel}
              className={selectClass}
              value={stage}
              disabled={pending}
              onChange={(event) => setStage(event.target.value as DealStage)}
            >
              {DEAL_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {dictionary.crm.stages[stage]}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor={reasonId}>
              {copy.reasonLabel(losing)}
            </FieldLabel>
            <Textarea
              id={reasonId}
              aria-label={copy.reasonAria}
              required={losing}
              value={reason}
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          {error && <p role="alert" className="text-destructive text-xs">{error}</p>}
          <Button
            type="submit"
            disabled={pending || (losing && !reason.trim())}
          >
            {pending ? copy.updating : copy.updateStage}
          </Button>
        </form>
        {confirmClose && <div role="alert" className="space-y-3 rounded-md border p-3 text-xs"><p>{copy.confirmCloseTitle}</p><div className="flex gap-2">
          <Button disabled={pending} onClick={async () => { if (await save()) onOpenChange(false); }}>{dictionary.recordSheet.common.saveAndClose}</Button>
          <Button variant="outline" disabled={pending} onClick={() => { setStage(openedStage.current); setReason(""); onOpenChange(false); }}>{dictionary.recordSheet.common.discard}</Button>
          <Button variant="ghost" disabled={pending} onClick={() => setConfirmClose(false)}>{dictionary.recordSheet.common.stay}</Button>
        </div></div>}
      </DialogContent>
    </Dialog>
  );
}
