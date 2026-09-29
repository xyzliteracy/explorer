import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { disposeModel, estimateModel } from './modelResources';

export const MOBILE_BUDGET = { bytes: 128 * 1024 * 1024, triangles: 600_000, concurrent: 1, idleMs: 5000 };
export type AssetState = { value?: GLTF; error?: Error; bytes: number; triangles: number };
type Entry = AssetState & { refs: number; priority: number; phase: 'queued' | 'loading' | 'ready' | 'error' | 'deferred'; needed?: { bytes: number; triangles: number }; claims: Map<symbol, number>; loadClaims: Map<symbol, number>; idleAt: number };
export type AssetStatus = { total: number; ready: number; loading: number; bytes: number; triangles: number; errors: string[] };

/** Shared ownership for both renderers. No React or platform transport dependencies. */
export class ModelAssetStore {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private active = 0;
  private version = 0;
  private closed = false;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private load: (url: string) => Promise<GLTF>, readonly budget = MOBILE_BUDGET, private dispose = disposeModel, private estimate = estimateModel) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.version;
  get(url: string, claim?: symbol): AssetState | undefined {
    const entry = this.entries.get(url);
    if (!entry?.value || !claim) return entry;
    let triangles = 0;
    const claims = [...this.entries.values()].flatMap(asset => asset.value ? [...asset.claims].map(([id, priority]) => ({ id, priority, triangles: asset.triangles })) : []).sort((a, b) => b.priority - a.priority);
    for (const item of claims) {
      const fits = triangles + item.triangles <= this.budget.triangles;
      if (fits) triangles += item.triangles;
      if (item.id === claim) return fits ? entry : { bytes: 0, triangles: 0, error: Error('Visible instance triangle budget reached; retaining preview.') };
    }
    return undefined;
  }
  private changed() { this.version++; this.listeners.forEach(listener => listener()); }
  acquire(url: string, priority = 0, claim = Symbol(url), renderPriority = priority) {
    if (this.closed) throw Error('Model store is closed');
    let entry = this.entries.get(url);
    if (!entry) {
      entry = { refs: 0, priority, phase: 'queued', idleAt: 0, bytes: 0, triangles: 0, claims: new Map(), loadClaims: new Map() };
      this.entries.set(url, entry);
    }
    entry.claims.set(claim, renderPriority);
    entry.loadClaims.set(claim, priority);
    entry.refs++; entry.priority = Math.max(entry.priority, priority);
    this.changed(); this.pump();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      entry!.claims.delete(claim);
      entry!.loadClaims.delete(claim);
      entry!.priority = Math.max(0, ...entry!.loadClaims.values());
      entry!.refs--;
      if (!entry!.refs) {
        entry!.idleAt = Date.now();
        if (entry!.phase === 'queued' || entry!.phase === 'error' || entry!.phase === 'deferred') this.entries.delete(url);
      }
      this.sweep(); this.changed(); this.pump();
    };
  }
  private remove(url: string, entry: Entry) {
    if (entry.value) this.dispose(entry.value);
    this.entries.delete(url);
  }
  private sweep(force = false) {
    clearTimeout(this.timer);
    for (const [url, entry] of this.entries) if (!entry.refs && entry.phase !== 'loading' && (force || Date.now() - entry.idleAt >= this.budget.idleMs)) this.remove(url, entry);
    if (!this.closed && [...this.entries.values()].some(entry => !entry.refs && entry.phase === 'ready')) {
      this.timer = setTimeout(() => { this.sweep(); this.changed(); }, this.budget.idleMs);
    }
  }
  private hasCapacity(cost: { bytes: number }) {
    const pinned = [...this.entries.values()].filter(entry => entry.refs).reduce((sum, entry) => sum + entry.bytes, 0);
    return pinned + cost.bytes <= this.budget.bytes;
  }
  retry() {
    for (const entry of this.entries.values()) if (entry.phase === 'error') { entry.phase = 'queued'; entry.error = undefined; }
    this.changed(); this.pump();
  }
  private pump() {
    if (this.closed) return;
    while (this.active < this.budget.concurrent) {
      const next = [...this.entries.entries()].filter(([, entry]) => entry.refs && (entry.phase === 'queued' || (entry.phase === 'deferred' && this.hasCapacity(entry.needed!)))).sort((a, b) => b[1].priority - a[1].priority)[0];
      if (!next) break;
      const [url, entry] = next;
      entry.phase = 'loading'; this.active++;
      void Promise.resolve().then(() => this.closed || !entry.refs ? undefined : this.load(url)).then(model => {
        if (!model) {
          if (entry.refs && !this.closed) entry.phase = 'queued';
          else if (this.entries.get(url) === entry) this.entries.delete(url);
          return;
        }
        if (this.closed || !entry.refs) { this.dispose(model); this.entries.delete(url); return; }
        const cost = this.estimate(model);
        this.sweep(true);
        const resident = this.status();
        if (cost.bytes > this.budget.bytes || cost.triangles > this.budget.triangles) {
          this.dispose(model);
          throw Error('Model exceeds the mobile scene budget. Use a prepared preview/standard asset.');
        }
        if (cost.bytes + resident.bytes > this.budget.bytes) {
          this.dispose(model);
          entry.needed = cost; entry.phase = 'deferred';
          entry.error = Error('Waiting for model memory budget; retaining preview.');
          return;
        }
        Object.assign(entry, cost, { value: model, phase: 'ready', error: undefined });
      }).catch(reason => {
        if (this.closed || !entry.refs) { this.entries.delete(url); return; }
        entry.error = reason instanceof Error ? reason : Error(String(reason)); entry.phase = 'error';
      }).finally(() => { this.active--; this.changed(); this.pump(); });
    }
  }
  status(): AssetStatus {
    const all = [...this.entries.entries()];
    return {
      total: all.filter(([, entry]) => entry.refs).length,
      ready: all.filter(([, entry]) => entry.refs && entry.phase === 'ready').length,
      loading: all.filter(([, entry]) => entry.phase === 'loading' || entry.phase === 'queued').length,
      bytes: all.reduce((sum, [, entry]) => sum + entry.bytes, 0),
      triangles: all.reduce((sum, [, entry]) => sum + entry.triangles, 0),
      errors: all.filter(([, entry]) => entry.refs && entry.error).map(([url, entry]) => `${url}: ${entry.error!.message}`),
    };
  }
  close() {
    this.closed = true; clearTimeout(this.timer);
    for (const [url, entry] of this.entries) this.remove(url, entry);
    this.listeners.clear();
  }
}
