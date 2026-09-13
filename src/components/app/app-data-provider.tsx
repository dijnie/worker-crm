"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ApiError, createApiClient } from "@/lib/api";
import { AppDataStore } from "@/lib/app-data-store";
import { authClient } from "@/lib/auth/auth-client";
import { safeReturnUrl } from "@/lib/auth/safe-return-url";
import type { AccountIdentity } from "@/lib/auth/request-context";

type AppData = { api: ReturnType<typeof createApiClient>; store: AppDataStore; account: AccountIdentity;
  generation: number; invalidate: (resources: readonly string[]) => void; clear: () => void; resume: () => void };
const Context = createContext<AppData | null>(null);
export function AppDataProvider({ account, children }: { account: AccountIdentity; children: ReactNode }) {
  return <AccountData key={account.id} account={account}>{children}</AccountData>;
}
function AccountData({ account, children }: { account: AccountIdentity; children: ReactNode }) {
  const [store] = useState(() => new AppDataStore());
  const session = authClient.useSession();
  const sessionId = useRef<string | undefined>(undefined);
  const role = useRef(account.role);
  const [accessError, setAccessError] = useState("");
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const value = useMemo(() => {
    let rechecking: Promise<void> | undefined;
    const navigate = (error: ApiError) => {
      store.clear(true);
      window.location.assign(error.status === 401
        ? `/sign-in?returnTo=${encodeURIComponent(safeReturnUrl(window.location.pathname + window.location.search))}` : "/access-revoked");
    };
    const raw = createApiClient();
    const api = createApiClient({
      fetch: async (input, init) => {
        const generation = store.generation;
        const controller = new AbortController();
        const untrack = store.track(controller);
        try {
          const response = await fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal });
          // Buffer JSON while still tracked: response.json() must not escape the access epoch.
          const body = await response.arrayBuffer();
          if (!store.isCurrent(generation)) throw new DOMException("Workspace changed", "AbortError");
          return new Response(body.byteLength ? body : null, { status: response.status, statusText: response.statusText, headers: response.headers });
        } finally { untrack(); }
      },
      onError: async (error, path) => {
        if (error.status === 401 || error.code === "INACTIVE_MEMBERSHIP") { navigate(error); return; }
        if (error.status !== 403) return;
        if (!rechecking) {
          store.clear(true); store.deny(path.split("/")[2], error); setAccessError(error.message);
          rechecking = raw.assignees.list({ limit: 1 }).then(() => { store.resume(); }).catch((failure: unknown) => {
            if (failure instanceof ApiError && (failure.status === 401 || failure.code === "INACTIVE_MEMBERSHIP")) navigate(failure);
            else setAccessError("Access could not be checked. Reload to try again.");
          }).finally(() => { rechecking = undefined; });
        }
        await rechecking;
      },
    });
    return { api, store, account, invalidate: (resources: readonly string[]) => store.invalidate(resources),
      clear: () => store.clear(true), resume: () => store.resume() };
  }, [account, store]);
  useEffect(() => {
    if (role.current !== account.role) { role.current = account.role; store.clear(); }
  }, [account.role, store]);
  useEffect(() => {
    if (session.isPending) return;
    if (!session.data && !session.error) {
      store.clear(true);
      window.location.assign(`/sign-in?returnTo=${encodeURIComponent(safeReturnUrl(window.location.pathname + window.location.search))}`);
    } else if (session.data) {
      const id = session.data.session.id;
      if (session.data.user.id !== account.id || (sessionId.current && sessionId.current !== id)) {
        store.clear(true); window.location.reload();
      }
      sessionId.current = id;
    }
  }, [session.data, session.isPending, session.error, account.id, store]);
  useEffect(() => { store.resume(); return () => store.clear(true); }, [store]);
  return <Context.Provider value={{ ...value, generation: store.generation }}>
    {accessError && <div role="alert" className="border-b bg-muted p-3 text-sm">{accessError}<button className="ml-3 underline" onClick={() => setAccessError("")}>Dismiss</button></div>}
    {children}
  </Context.Provider>;
}
export function useAppData() {
  const context = useContext(Context);
  if (!context) throw new Error("AppDataProvider is required");
  return context;
}
export function useAppQuery<T>(resource: string, query: unknown, loader: (signal: AbortSignal) => Promise<T>) {
  const { store, generation } = useAppData();
  const version = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const key = store.key(resource, query);
  const latestLoader = useRef(loader); latestLoader.current = loader;
  const previous = useRef<{ key: string; generation: number; data?: T } | null>(null);
  const state = store.state<T>(key);
  // Keep a same-query snapshot during refresh only, never across navigation or access epochs.
  if (state?.data !== undefined) previous.current = { key, generation, data: state.data };
  const retained = previous.current?.key === key && previous.current.generation === generation ? previous.current.data : undefined;
  useEffect(() => store.retain(key), [store, key]);
  useEffect(() => { if (!store.state(key)) void store.load(resource, key, signal => latestLoader.current(signal)); }, [store, key, resource, generation, version]);
  const data = state?.data ?? (state?.error ? undefined : retained);
  const loading = !state || state.loading;
  const refresh = () => store.invalidate([resource]);
  return { data, error: state?.error, loading: loading && data === undefined, refreshing: loading && data !== undefined,
    isLoading: loading && data === undefined, isRefreshing: loading && data !== undefined, refresh, refetch: refresh };
}
