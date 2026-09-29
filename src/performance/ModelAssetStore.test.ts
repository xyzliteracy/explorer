import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ModelAssetStore } from './ModelAssetStore';
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const model = (bytes = 10, triangles = 10) => ({ bytes, triangles }) as unknown as GLTF;
const cost = (value: Pick<GLTF, 'scenes'>) => value as unknown as { bytes: number; triangles: number };
const stores: ModelAssetStore[] = [];
function setup(load: (url: string) => Promise<GLTF>) {
  const dispose = vi.fn();
  const store = new ModelAssetStore(load, { bytes: 100, triangles: 100, concurrent: 1, idleMs: 50 }, dispose, cost);
  stores.push(store); return { store, dispose };
}
afterEach(() => { stores.forEach(store => store.close()); stores.length = 0; vi.useRealTimers(); });
describe('shared asset ownership and mobile budgets', () => {
  it('serializes loading and cancels queued work released before it starts', async () => {
    let finish!: (value: GLTF) => void;
    const load = vi.fn(() => new Promise<GLTF>(resolve => { finish = resolve; }));
    const { store } = setup(load);
    store.acquire('a'); const releaseB = store.acquire('b'); store.acquire('c');
    await flush(); expect(load).toHaveBeenCalledTimes(1);
    releaseB(); finish(model()); await flush();
    expect(load.mock.calls).toHaveLength(2);
    expect(store.get('b')).toBeUndefined();
    finish(model()); await flush();
  });
  it('retains a shared URL until its last consumer leaves and evicts after grace', async () => {
    vi.useFakeTimers(); const load = vi.fn(async () => model()); const { store, dispose } = setup(load);
    const a = store.acquire('a'), b = store.acquire('a'); await flush();
    a(); vi.advanceTimersByTime(100); expect(dispose).not.toHaveBeenCalled();
    b(); vi.advanceTimersByTime(51); expect(dispose).toHaveBeenCalledTimes(1); expect(load).toHaveBeenCalledTimes(1);
  });
  it('disposes stale in-flight results but preserves rapid reacquisition', async () => {
    let finish!: (value: GLTF) => void;
    const { store, dispose } = setup(() => new Promise(resolve => { finish = resolve; }));
    const release = store.acquire('a'); await flush(); release(); store.acquire('a'); finish(model()); await flush();
    expect(dispose).not.toHaveBeenCalled(); expect(store.get('a')?.value).toBeDefined();
  });
  it('requeues a lease reacquired between cancellation promise callbacks', async () => {
    const load = vi.fn(async () => model()); const { store } = setup(load);
    const release = store.acquire('a'); release();
    await Promise.resolve();
    store.acquire('a'); await flush();
    expect(load).toHaveBeenCalledOnce(); expect(store.get('a')?.value).toBeDefined();
  });
  it('disposes a removed in-flight result exactly once', async () => {
    let finish!: (value: GLTF) => void;
    const { store, dispose } = setup(() => new Promise(resolve => { finish = resolve; }));
    const release = store.acquire('a'); await flush(); release(); finish(model()); await flush(); store.close();
    expect(dispose).toHaveBeenCalledTimes(1); expect(store.get('a')).toBeUndefined();
  });
  it('rejects an oversized asset without retaining it', async () => {
    const { store, dispose } = setup(async () => model(101)); store.acquire('a'); await flush();
    expect(store.get('a')?.error?.message).toContain('budget'); expect(store.status().bytes).toBe(0); expect(dispose).toHaveBeenCalledTimes(1);
  });
  it('defers capacity-limited assets and retries only when space becomes available', async () => {
    const load = vi.fn(async () => model(60)); const { store } = setup(load);
    const releaseA = store.acquire('a'); store.acquire('b'); await flush();
    expect(load).toHaveBeenCalledTimes(2); expect(store.get('b')?.value).toBeUndefined();
    releaseA(); await flush();
    expect(load).toHaveBeenCalledTimes(3); expect(store.get('b')?.value).toBeDefined(); expect(store.status().bytes).toBe(60);
  });
  it('budgets visible instances separately from shared geometry storage', async () => {
    const { store } = setup(async () => model(10, 60)); const a = Symbol(), b = Symbol();
    const releaseA = store.acquire('a', 1, a); store.acquire('a', 1, b); await flush();
    expect(store.get('a', a)?.value).toBeDefined(); expect(store.get('a', b)?.value).toBeUndefined(); expect(store.status().bytes).toBe(10);
    releaseA(); expect(store.get('a', b)?.value).toBeDefined();
  });
  it('admits detail before standard independently of loading priority', async () => {
    const { store } = setup(async () => model(10, 60)); const standard = Symbol(), detail = Symbol();
    store.acquire('standard', 500, standard, 500); await flush();
    expect(store.get('standard', standard)?.value).toBeDefined();
    store.acquire('detail', 100, detail, 900); await flush();
    expect(store.get('detail', detail)?.value).toBeDefined();
    expect(store.get('standard', standard)?.value).toBeUndefined();
  });
  it('drops selection queue priority when the selected consumer releases', async () => {
    let finish!: (value: GLTF) => void;
    const order: string[] = [];
    const { store } = setup(url => { order.push(url); return new Promise(resolve => { finish = resolve; }); });
    store.acquire('busy'); await flush();
    store.acquire('shared', 1);
    const deselect = store.acquire('shared', 2000);
    store.acquire('visible', 500);
    deselect(); finish(model()); await flush();
    expect(order).toEqual(['busy', 'visible']);
    finish(model()); await flush(); finish(model()); await flush();
  });
  it('retries failed requests explicitly without reloading healthy assets', async () => {
    let fail = true; const load = vi.fn(async (url: string) => { if (url === 'b' && fail) throw Error('offline'); return model(); });
    const { store } = setup(load); store.acquire('a'); store.acquire('b'); await flush(); fail = false; store.retry(); await flush();
    expect(load).toHaveBeenCalledTimes(3); expect(store.status().ready).toBe(2);
  });
  it('closes queued and in-flight work without reviving the store', async () => {
    let finish!: (value: GLTF) => void; const load = vi.fn(() => new Promise<GLTF>(resolve => { finish = resolve; }));
    const { store, dispose } = setup(load); store.acquire('a'); store.acquire('b'); await flush(); store.close(); finish(model()); await flush();
    expect(dispose).toHaveBeenCalledTimes(1); expect(load).toHaveBeenCalledTimes(1); expect(store.status().total).toBe(0);
  });
});
