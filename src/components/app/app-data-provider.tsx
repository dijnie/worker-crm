"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ApiError, createApiClient } from "@/lib/api";
import { AppDataStore } from "@/lib/app-data-store";
import { authClient } from "@/lib/auth/auth-client";
import { safeReturnUrl } from "@/lib/auth/safe-return-url";
import type { AccountIdentity } from "@/lib/auth/request-context";
import { useDictionary } from "./i18n-provider";

type AppData = { api: ReturnType<typeof createApiClient>; store: AppDataStore; account: AccountIdentity;
  generation: number; invalidate: (resources: readonly string[]) => void; clear: () => void; resume: () => void;
  refreshAccount: () => Promise<void> };
const Context = createContext<AppData | null>(null);
const accessSignature = (account: AccountIdentity) => JSON.stringify([account.id, account.accessVersion, account.membershipRevision, account.role, account.permissions]);
export function AppDataProvider({ account, children }: { account: AccountIdentity; children: ReactNode }) {
  return <AccountData key={account.id} initialAccount={account}>{children}</AccountData>;
}
function AccountData({ initialAccount, children }: { initialAccount: AccountIdentity; children: ReactNode }) {
  const [store] = useState(() => new AppDataStore());
  const [account, setAccount] = useState(initialAccount);
  const current = useRef(account); current.current = account;
  const session = authClient.useSession();
  const sessionId = useRef<string | undefined>(undefined);
  const [accessUnavailable, setAccessUnavailable] = useState(false);
  const rechecking = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  const identityController = useRef<AbortController | null>(null);
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const navigate = useCallback((error: ApiError) => {
    store.clear(true);
    window.location.assign(error.status === 401
      ? `/sign-in?returnTo=${encodeURIComponent(safeReturnUrl(window.location.pathname + window.location.search))}` : "/access-revoked");
  }, [store]);
  const refreshAccount = useCallback((): Promise<void> => {
    if (rechecking.current) return rechecking.current;
    const controller = new AbortController(); identityController.current = controller;
    rechecking.current = createApiClient().account({ signal: controller.signal }).then(next => {
      if (!mounted.current || controller.signal.aborted) return;
      if (next.id !== current.current.id) { store.clear(true); window.location.reload(); return; }
      if (accessSignature(next) !== accessSignature(current.current)) {
        store.clear(true); current.current = next; setAccount(next);
      }
      setAccessUnavailable(false); store.resume();
    }).catch((failure: unknown) => {
      if (!mounted.current || controller.signal.aborted) return;
      if (failure instanceof ApiError && (failure.status === 401 || failure.code === "INACTIVE_MEMBERSHIP")) navigate(failure);
      else { store.clear(true); setAccessUnavailable(true); }
    }).finally(() => { rechecking.current = null; });
    return rechecking.current;
  }, [navigate, store]);
  const api = useMemo(() => createApiClient({
    fetch: async (input, init) => {
      const generation = store.generation;
      const controller = new AbortController(); const untrack = store.track(controller);
      try {
        const response = await fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal });
        const body = await response.arrayBuffer();
        if (!store.isCurrent(generation)) throw new DOMException("Workspace changed", "AbortError");
        return new Response(body.byteLength ? body : null, { status: response.status, statusText: response.statusText, headers: response.headers });
      } finally { untrack(); }
    },
    onError: async error => {
      if (error.status === 401 || error.code === "INACTIVE_MEMBERSHIP") { navigate(error); return; }
      if (error.status === 403) await refreshAccount();
    },
  }), [navigate, refreshAccount, store]);
  useEffect(() => {
    if (session.isPending) return;
    if (!session.data && !session.error) {
      store.clear(true);
      window.location.assign(`/sign-in?returnTo=${encodeURIComponent(safeReturnUrl(window.location.pathname + window.location.search))}`);
    } else if (session.data) {
      const id = session.data.session.id;
      if (session.data.user.id !== account.id || (sessionId.current && sessionId.current !== id)) { store.clear(true); window.location.reload(); }
      sessionId.current = id;
    }
  }, [session.data, session.isPending, session.error, account.id, store]);
  useEffect(() => {
    mounted.current = true; store.resume();
    const refresh = () => { if (document.visibilityState === "visible") void refreshAccount(); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => { mounted.current = false; identityController.current?.abort(); window.clearInterval(timer);
      window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); store.clear(true); };
  }, [refreshAccount, store]);
  const value = { api, store, account, generation: store.generation, refreshAccount,
    invalidate: (resources: readonly string[]) => store.invalidate(resources), clear: () => store.clear(true), resume: () => store.resume() };
  return <Context.Provider value={value}>
    {accessUnavailable ? <AccessUnavailableNotice onRetry={() => void refreshAccount()} /> : children}
  </Context.Provider>;
}
// A separate component so its dictionary lookup only runs while access is
// actually unavailable, not on every render of the (much more common) happy path.
function AccessUnavailableNotice({ onRetry }: { onRetry: () => void }) {
  const { shell } = useDictionary();
  return (
    <div role="alert" className="mx-auto max-w-lg space-y-4 p-8">
      <p>{shell.appDataProvider.accessUnavailable}</p>
      <button className="underline" onClick={onRetry}>{shell.appDataProvider.checkAccessAgain}</button>
    </div>
  );
}
export function useAppData() {
  const context = useContext(Context);
  if (!context) throw new Error("AppDataProvider is required");
  return context;
}
export function useAppQuery<T>(resource: string, query: unknown, loader: (signal: AbortSignal) => Promise<T>, enabled = true) {
  const { store, generation } = useAppData();
  const version = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const key = store.key(resource, query);
  const latestLoader = useRef(loader); latestLoader.current = loader;
  const previous = useRef<{ key: string; generation: number; data?: T } | null>(null);
  const state = store.state<T>(key);
  // Keep a same-query snapshot during refresh only, never across navigation or access epochs.
  if (state?.data !== undefined) previous.current = { key, generation, data: state.data };
  const retained = previous.current?.key === key && previous.current.generation === generation ? previous.current.data : undefined;
  useEffect(() => enabled ? store.retain(key) : undefined, [store, key, enabled]);
  useEffect(() => { if (enabled && !store.state(key)) void store.load(resource, key, signal => latestLoader.current(signal)); }, [store, key, resource, generation, version, enabled]);
  const data = enabled ? state?.data ?? (state?.error ? undefined : retained) : undefined;
  const loading = enabled && (!state || state.loading);
  const refresh = () => store.invalidate([resource]);
  return { data, error: enabled ? state?.error : undefined, loading: loading && data === undefined, refreshing: loading && data !== undefined,
    isLoading: loading && data === undefined, isRefreshing: loading && data !== undefined, refresh, refetch: refresh };
}
