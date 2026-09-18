"use client";
import { canPermission } from "@/lib/auth/permissions";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAppData } from "../app-data-provider";
import { RECORD_INVALIDATIONS, type RecordEntity } from "../records/form-values";
import { propertyError } from "./property-values";
export function RecordActions({ entity, id, archivedAt }: { entity: RecordEntity; id: string; archivedAt: string | null }) {
  const { api, store, generation, invalidate, account } = useAppData();
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function run() {
    if (submitting.current) return;
    submitting.current = true; setPending(true); setError(""); setMessage("");
    try {
      const client = entity === "company" ? api.companies : entity === "contact" ? api.contacts : api.deals;
      await (archivedAt ? client.restore(id) : client.archive(id));
      if (!store.isCurrent(generation)) return;
      invalidate(RECORD_INVALIDATIONS);
      if (!mounted.current) return;
      setConfirm(false); setMessage(archivedAt ? "Record restored." : "Record archived.");
    } catch (failure) { if (mounted.current && store.isCurrent(generation)) setError(propertyError(failure)); }
    finally { submitting.current = false; if (mounted.current && store.isCurrent(generation)) setPending(false); }
  }
  if (!canPermission(account, entity, archivedAt ? "restore" : "archive")) return null;
  return <div className="space-y-2">
    <div className="flex items-center gap-2">
      {archivedAt && <span className="rounded-sm bg-muted px-2 py-0.5 text-muted-foreground text-xs">Archived</span>}
      <Button type="button" variant="outline-ghost" size="sm" disabled={pending} onClick={() => archivedAt ? void run() : setConfirm(true)}>{pending ? "Updating…" : archivedAt ? "Restore record" : "Archive record"}</Button>
    </div>
    {error && <p role="alert" className="text-destructive text-xs">{error}</p>}{message && <p role="status" className="text-muted-foreground text-xs">{message}</p>}
    <Dialog open={confirm} onOpenChange={open => { if (!pending) setConfirm(open); }}><DialogContent className="gap-3 sm:max-w-md">
      <DialogTitle>Archive {entity}?</DialogTitle><DialogDescription>The record stays available in archived views and can be restored.</DialogDescription>
      {error && <p role="alert" className="text-destructive text-xs">{error}</p>}
      <div className="flex justify-end gap-2"><Button data-dialog-close variant="outline" disabled={pending} onClick={() => setConfirm(false)}>Cancel</Button><Button disabled={pending} onClick={() => void run()}>{pending ? "Archiving…" : "Archive"}</Button></div>
    </DialogContent></Dialog>
  </div>;
}
