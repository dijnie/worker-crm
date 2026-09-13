/** A store belongs to one mounted account. It never persists protected responses. */
export interface QueryState<T = unknown> { data?: T; error?: unknown; loading: boolean; refreshing: boolean }
interface Entry { resource: string; state: QueryState; promise?: Promise<unknown>; controller?: AbortController }
export function normalizedQueryKey(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().filter(key => item[key] !== undefined).map(key => [key, item[key]])) : item);
}
export class AppDataStore {
  generation = 0;
  version = 0;
  private entries = new Map<string, Entry>();
  private observers = new Map<string, number>();
  retain(key: string) {
    this.observers.set(key, (this.observers.get(key) ?? 0) + 1);
    return () => {
      const count = (this.observers.get(key) ?? 1) - 1;
      if (count) this.observers.set(key, count);
      else {
        this.observers.delete(key);
        const entry = this.entries.get(key);
        if (entry?.promise) { entry.controller?.abort(); this.entries.delete(key); }
      }
    };
  }
  private listeners = new Set<() => void>();
  private controllers = new Set<AbortController>();
  private blocked = false;
  private denied = new Map<string, unknown>();
  deny(resource: string, error: unknown) { this.denied.set(resource, error); }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.version;
  private emit() { this.version++; this.listeners.forEach(listener => listener()); }
  isCurrent = (generation: number) => !this.blocked && this.generation === generation;
  key(resource: string, query: unknown) { return `${resource}:${normalizedQueryKey(query)}`; }
  state<T>(key: string): QueryState<T> | undefined { return this.entries.get(key)?.state as QueryState<T> | undefined; }
  track(controller: AbortController) { this.controllers.add(controller); return () => { this.controllers.delete(controller); }; }
  clear(block = false) {
    this.generation++; this.blocked = block; this.denied.clear();
    this.controllers.forEach(controller => controller.abort()); this.controllers.clear();
    this.entries.forEach(entry => entry.controller?.abort()); this.entries.clear(); this.emit();
  }
  resume() { this.blocked = false; this.emit(); }
  invalidate(resources: readonly string[]) {
    const affected = new Set(resources);
    resources.forEach(resource => this.denied.delete(resource));
    if (resources.some(resource => /compan|contact|deal|record|stage/.test(resource))) {
      ["companies", "contacts", "deals", "company", "contact", "deal", "activities", "stats", "relations", "details", "facets", "recent", "recent-feed"].forEach(resource => affected.add(resource));
    }
    if (resources.some(resource => /member|assignee|identity/.test(resource))) {
      ["members", "assignees", "identity", "companies", "contacts", "deals"].forEach(resource => affected.add(resource));
    }
    for (const [key, entry] of this.entries) if ([...affected].some(resource => entry.resource === resource || entry.resource.startsWith(`${resource}:`) || entry.resource.startsWith(`${resource}/`))) {
      entry.controller?.abort(); this.entries.delete(key);
    }
    this.emit();
  }
  async load<T>(resource: string, key: string, loader: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    if (this.blocked) return;
    const denied = [...this.denied].find(([name]) => resource === name || resource.startsWith(`${name}:`) || resource.startsWith(`${name}/`));
    if (denied) {
      if (!this.entries.has(key)) { this.entries.set(key, { resource, state: { error: denied[1], loading: false, refreshing: false } }); this.emit(); }
      return;
    }
    const existing = this.entries.get(key);
    if (existing?.promise) return existing.promise as Promise<T | undefined>;
    if (existing) return existing.state.data as T | undefined;
    const generation = this.generation;
    const controller = new AbortController();
    const entry: Entry = { resource, state: { loading: true, refreshing: false }, controller };
    this.entries.set(key, entry);
    const valid = () => this.isCurrent(generation) && this.entries.get(key) === entry && !controller.signal.aborted;
    entry.promise = Promise.resolve().then(() => loader(controller.signal)).then(data => {
      if (!valid()) return;
      entry.state = { data, loading: false, refreshing: false }; return data;
    }).catch(error => {
      if (valid()) entry.state = { error, loading: false, refreshing: false };
    }).finally(() => { if (valid()) { entry.promise = undefined; this.emit(); } });
    this.emit();
    return entry.promise as Promise<T | undefined>;
  }
}
