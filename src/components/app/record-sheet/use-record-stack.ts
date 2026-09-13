"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppData } from "../app-data-provider";
import { RECORD_OPEN_EVENT, openRecord, parseRecordStack, writeRecordStack, type RecordRef } from "./record-navigation";
import type { DirtyEditor } from "./inline-field";

const HISTORY_INDEX = "workerRecordHistoryIndex";
function readLocation() {
  try { return { stack: parseRecordStack(window.location.search), error: null }; }
  catch (error) { return { stack: [] as RecordRef[], error: error instanceof Error ? error : new Error("Invalid record link.") }; }
}

/** The browser URL owns the stack; the registry contains drafts, never another stack. */
export function useRecordStack() {
  const { generation, store } = useAppData();
  const [location, setLocation] = useState<{ stack: RecordRef[]; error: Error | null }>({ stack: [], error: null });
  const editors = useRef(new Map<string, DirtyEditor>());
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftPending, setDraftPending] = useState(false);
  const [saveError, setSaveError] = useState("");
  const next = useRef<(() => void) | null>(null);
  const bypass = useRef(false);
  const busy = useRef(false);
  const currentGeneration = useRef(generation);
  currentGeneration.current = generation;
  const dirty = useCallback(() => [...editors.current.values()].some(editor => editor.dirty), []);
  const onDirtyChange = useCallback((key: string, editor: DirtyEditor | null) => {
    if (editor) editors.current.set(key, editor); else editors.current.delete(key);
    setDraftPending([...editors.current.values()].some(value => value.pending));
  }, []);
  const request = useCallback((action: () => void) => {
    const execute = () => {
      try { action(); }
      catch (error) { setLocation(current => ({ ...current, error: error instanceof Error ? error : new Error("Could not open record.") })); }
    };
    if (dirty() && !bypass.current && store.isCurrent(currentGeneration.current)) {
      next.current = execute; setSaveError(""); setPending(true);
    } else execute();
  }, [dirty, store]);

  useEffect(() => {
    editors.current.clear(); next.current = null; setPending(false); setSaving(false); setDraftPending(false); setSaveError("");
  }, [generation]);

  useEffect(() => {
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;
    let index = Number(window.history.state?.[HISTORY_INDEX]) || 0;
    let href = window.location.href;
    let restoring = false;
    originalReplace.call(window.history, { ...window.history.state, [HISTORY_INDEX]: index }, "");
    const sync = () => { href = window.location.href; setLocation(readLocation()); };
    sync();
    function wrap(method: typeof originalPush, push: boolean): typeof originalPush {
      return function (data, unused, url) {
        if (url == null) { method.call(window.history, { ...data, [HISTORY_INDEX]: index }, unused, url); return; }
        const target = new URL(url, window.location.href);
        // Keep native same-origin enforcement. No guarded action can send record refs elsewhere.
        if (target.origin !== window.location.origin) throw new DOMException("Record navigation must stay in this workspace", "SecurityError");
        const commit = () => {
          if (push) index++;
          method.call(window.history, { ...data, [HISTORY_INDEX]: index }, unused, url);
          sync();
        };
        if (target.href === href) commit(); else request(commit);
      };
    }
    const push = wrap(originalPush, true);
    const replace = wrap(originalReplace, false);
    window.history.pushState = push;
    window.history.replaceState = replace;
    const pop = () => {
      const targetIndex = Number(window.history.state?.[HISTORY_INDEX]);
      if (restoring) { restoring = false; return; }
      if (window.location.href === href) return;
      if (dirty() && !bypass.current && store.isCurrent(currentGeneration.current)) {
        const delta = Number.isFinite(targetIndex) ? targetIndex - index : 0;
        if (delta) {
          restoring = true;
          window.history.go(-delta);
          request(() => { bypass.current = true; window.history.go(delta); });
        } else {
          const target = window.location.href;
          originalReplace.call(window.history, { ...window.history.state, [HISTORY_INDEX]: index }, "", href);
          request(() => { originalReplace.call(window.history, { ...window.history.state, [HISTORY_INDEX]: index }, "", target); sync(); });
        }
        return;
      }
      bypass.current = false;
      if (Number.isFinite(targetIndex)) index = targetIndex;
      sync();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty() && store.isCurrent(currentGeneration.current)) { event.preventDefault(); event.returnValue = ""; }
    };
    const link = (event: MouseEvent) => {
      if (!dirty() || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href);
      if (url.href === window.location.href || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      event.preventDefault(); event.stopPropagation();
      request(() => { bypass.current = true; editors.current.clear(); window.location.assign(url.href); });
    };
    const open = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== "function") return;
      event.preventDefault(); request(event.detail);
    };
    window.addEventListener(RECORD_OPEN_EVENT, open);
    window.addEventListener("popstate", pop);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", link, true);
    return () => {
      if (window.history.pushState === push) window.history.pushState = originalPush;
      if (window.history.replaceState === replace) window.history.replaceState = originalReplace;
      window.removeEventListener(RECORD_OPEN_EVENT, open);
      window.removeEventListener("popstate", pop); window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", link, true);
    };
  }, [dirty, request, store]);

  const stay = () => { if (!busy.current) { next.current = null; setPending(false); setSaveError(""); } };
  const finish = () => {
    const action = next.current; next.current = null; setPending(false); setSaveError("");
    editors.current.clear(); action?.();
  };
  const discard = () => {
    if (busy.current || [...editors.current.values()].some(editor => editor.pending)) return;
    for (const editor of editors.current.values()) editor.discard();
    finish();
  };
  const save = async () => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setSaveError("");
    const epoch = generation;
    try {
      for (const editor of [...editors.current.values()]) {
        if (editor.dirty && !(await editor.save())) {
          if (store.isCurrent(epoch)) setSaveError("Some changes could not be saved. Stay on this record to review the field errors.");
          return;
        }
        if (!store.isCurrent(epoch)) return;
      }
      if (store.isCurrent(epoch)) finish();
    } catch (error) {
      if (store.isCurrent(epoch)) setSaveError(error instanceof Error ? error.message : "Changes could not be saved.");
    } finally { busy.current = false; if (store.isCurrent(epoch)) setSaving(false); }
  };
  return { ...location, onDirtyChange, pending, saving: saving || draftPending, saveError, stay, save, discard,
    open: (ref: RecordRef) => openRecord(ref),
    back: () => request(() => writeRecordStack(location.stack.slice(0, -1))),
    closeAll: () => request(() => writeRecordStack([])),
  };
}
