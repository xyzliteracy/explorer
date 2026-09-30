import { describe, expect, it, vi } from 'vitest';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SelectedModelAssetStore, SELECTED_MODEL_BUDGET } from './SelectedModelAssetStore';
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const model = { bytes: 256 * 1024 * 1024, triangles: 3_000_000 } as unknown as GLTF;
const estimate = () => ({ bytes: 256 * 1024 * 1024, triangles: 3_000_000 });

describe('selection-only original residency', () => {
  it('admits originals above prepared budgets and immediately disposes on deselection', async () => {
    const dispose = vi.fn();
    const store = new SelectedModelAssetStore(async () => model, SELECTED_MODEL_BUDGET, dispose, estimate);
    const claim = Symbol();
    const release = store.acquire('a.glb', 4000, claim);
    await flush();
    expect(store.get('a.glb', claim)?.value).toBe(model);
    release();
    expect(dispose).toHaveBeenCalledExactlyOnceWith(model);
    expect(store.status().bytes).toBe(0);
    store.close();
  });
  it('replaces the previous selection and ignores its later cleanup', async () => {
    const dispose = vi.fn();
    const store = new SelectedModelAssetStore(async () => model, SELECTED_MODEL_BUDGET, dispose, estimate);
    const releaseA = store.acquire('a.glb'); await flush();
    const releaseB = store.acquire('b.glb'); await flush();
    releaseA();
    expect(store.get('a.glb')).toBeUndefined();
    expect(store.status().ready).toBe(1);
    expect(store.get('b.glb')?.value).toBe(model);
    releaseB(); expect(store.status().bytes).toBe(0);
    store.close();
  });
  it('serializes original decodes and skips obsolete queued selections', async () => {
    let finish!: (value: GLTF) => void;
    const load = vi.fn((_url: string) => new Promise<GLTF>(resolve => { finish = resolve; }));
    const dispose = vi.fn();
    const store = new SelectedModelAssetStore(load, SELECTED_MODEL_BUDGET, dispose, estimate);
    store.acquire('a.glb'); await flush();
    store.acquire('b.glb');
    const releaseC = store.acquire('c.glb');
    expect(load).toHaveBeenCalledTimes(1);
    finish(model); await flush();
    expect(dispose).toHaveBeenCalledExactlyOnceWith(model);
    expect(load.mock.calls.map(call => call[0])).toEqual(['a.glb', 'c.glb']);
    releaseC(); finish(model); await flush();
    expect(store.status().bytes).toBe(0);
    expect(dispose).toHaveBeenCalledTimes(2);
    store.close();
  });
  it('exposes failure without retaining an original', async () => {
    const store = new SelectedModelAssetStore(async () => { throw Error('404'); }, SELECTED_MODEL_BUDGET);
    const release = store.acquire('missing.glb'); await flush();
    expect(store.get('missing.glb')?.error?.message).toBe('404');
    expect(store.status().bytes).toBe(0);
    release(); expect(store.status().total).toBe(0);
    store.close();
  });
});
