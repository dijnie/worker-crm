"use client";
import { canPermission } from "@/lib/auth/permissions";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { type TimelineActivity } from "@/lib/activity-presentation";
import { useAppData } from "../app-data-provider";
import { useDictionary } from "../i18n-provider";
import { propertyFailureMessage } from "../record-sheet/property-values";

// The timeline's landmarks are named in the interface language, so focus
// targets are found by that same translated name.
function labelled(label: string) {
  return `[aria-label="${CSS.escape(label)}"]`;
}

export function ActivityActions({ activity, onResult }: { activity: TimelineActivity; onResult: (message: string, error?: boolean) => void }) {
  const { api, store, generation, invalidate, account } = useAppData();
  const dictionary = useDictionary();
  const { common, crm, timeline } = dictionary;
  const copy = timeline.actions;
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const mounted = useRef(true);
  const opener = useRef<HTMLButtonElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function run(action: "complete" | "delete") {
    if (!canPermission(account, "activity", action) || busy.current || !store.isCurrent(generation)) return;
    busy.current = true; setPending(true); setError("");
    try {
      if (action === "delete") await api.activities.delete(activity.id);
      else await api.activities.complete(activity.id, { completed: !activity.completedAt });
      if (!store.isCurrent(generation)) return;
      // A filtered task can disappear when the refetch settles. Move focus
      // before invalidation, while its focused action still belongs to this row.
      if (action === "complete" && actions.current?.contains(document.activeElement)) {
        actions.current.closest(labelled(timeline.panel.sectionAriaLabel))?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
      }
      invalidate([action === "delete" ? "activity-delete" : "task-complete"]);
      if (!mounted.current) return;
      setConfirm(false);
      onResult(action === "delete" ? copy.deleted : activity.completedAt ? copy.reopened : copy.completed);
    } catch (failure) {
      if (!store.isCurrent(generation)) return;
      const message = propertyFailureMessage(failure, dictionary);
      if (mounted.current) { setError(message); onResult(message, true); }
      // A concurrent edit/removal is recoverable from the authoritative timeline.
      if (failure instanceof ApiError && (failure.status === 400 || failure.status === 404)) invalidate(["activities"]);
    } finally {
      busy.current = false;
      if (mounted.current && store.isCurrent(generation)) setPending(false);
    }
  }
  return <div ref={actions} className="flex flex-col gap-2">
    <div className="flex flex-wrap gap-2" aria-busy={pending}>
      {activity.type === "TASK" && canPermission(account, "activity", "complete") && <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void run("complete")}>{activity.completedAt ? copy.reopenTask : copy.completeTask}</Button>}
      {canPermission(account, "activity", "delete") && <Button ref={opener} type="button" variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={pending} onClick={() => { setError(""); setConfirm(true); }}>{copy.deleteActivity}</Button>}
    </div>
    {pending && <p role="status" className="text-xs text-muted-foreground">{copy.updating}</p>}
    {error && !confirm && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <Dialog open={confirm} onOpenChange={open => { if (!busy.current) setConfirm(open); }}>
      <DialogContent className="sm:max-w-md" onEscapeKeyDown={event => { if (busy.current) event.preventDefault(); }} onCloseAutoFocus={event => {
        event.preventDefault();
        const target = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>(`${labelled(timeline.panel.viewsAriaLabel)} [aria-selected="true"]`);
        target?.focus();
      }}>
        <DialogTitle>{copy.deleteDialog.title}</DialogTitle>
        <DialogDescription>{copy.deleteDialog.description(activity.subject || crm.activityTypes[activity.type])}{activity.type === "STAGE_CHANGE" && copy.deleteDialog.stageChangeNote}</DialogDescription>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button data-dialog-close type="button" variant="outline" disabled={pending} onClick={() => setConfirm(false)}>{common.cancel}</Button><Button type="button" variant="destructive" disabled={pending} onClick={() => void run("delete")}>{pending ? copy.deleteDialog.deleting : copy.deleteDialog.confirm}</Button></div>
      </DialogContent>
    </Dialog>
  </div>;
}
