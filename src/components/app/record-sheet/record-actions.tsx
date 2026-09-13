"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAppData } from "../app-data-provider";
import { RECORD_INVALIDATIONS, type RecordEntity } from "../records/form-values";
import { propertyError } from "./property-values";
export function RecordActions({ entity, id, archivedAt }: { entity: RecordEntity; id: string; archivedAt: string | null }) {
  const { api, store, generation, invalidate } = useAppData();
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
  return <div className="space-y-2">
    <div className="flex items-center gap-3">{archivedAt && <span className="rounded bg-muted px-2 py-1 text-xs">Archived</span>}
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => archivedAt ? void run() : setConfirm(true)}>{pending ? "Updating…" : archivedAt ? "Restore record" : "Archive record"}</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}
    <Dialog open={confirm} onOpenChange={open => { if (!pending) setConfirm(open); }}><DialogContent>
      <DialogTitle>Archive {entity}?</DialogTitle><DialogDescription>The record stays available in archived views and can be restored.</DialogDescription>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={() => setConfirm(false)}>Cancel</Button><Button disabled={pending} onClick={() => void run()}>{pending ? "Archiving…" : "Archive"}</Button></div>
    </DialogContent></Dialog>
  </div>;
}
