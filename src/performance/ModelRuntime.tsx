import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { LoadingManager } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ModelAssetStore, type AssetStatus } from './ModelAssetStore';
import { SelectedModelAssetStore, SELECTED_MODEL_BUDGET } from './SelectedModelAssetStore';
import { disposeModel } from './modelResources';

const Context = createContext<ModelAssetStore | undefined>(undefined);
const SelectedContext = createContext<ModelAssetStore | undefined>(undefined);
const direct = async (url: string) => url;
export const PERFORMANCE_CANVAS = { frameloop: 'demand' as const, dpr: [1, 1.5] as [number, number], shadows: false, gl: { antialias: false } };

export function ModelRuntime({ children, transport = direct, onStatus, retry = 0 }: { children: ReactNode; retry?: number; transport?: (url: string) => Promise<string>; onStatus?: (status: AssetStatus) => void }) {
  const { gl, invalidate, setFrameloop } = useThree();
  useEffect(() => {
    const visibility = () => { setFrameloop(document.hidden ? 'never' : 'demand'); if (!document.hidden) invalidate(); };
    document.addEventListener('visibilitychange', visibility); visibility();
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [invalidate, setFrameloop]);
  const [stores, setStores] = useState<{ prepared: ModelAssetStore; original: SelectedModelAssetStore }>();
  const store = stores?.prepared;
  useEffect(() => {
    const root = new URL('decoders/', new URL(import.meta.env.BASE_URL, location.href)).href;
    const draco = new DRACOLoader().setDecoderPath(root + 'draco/').setWorkerLimit(1);
    const ktx = new KTX2Loader().setTranscoderPath(root + 'basis/').setWorkerLimit(1).detectSupport(gl);
    const load = async (url: string) => {
      const manager = new LoadingManager();
      const failed: string[] = [];
      manager.onError = url => failed.push(url);
      const model = await new GLTFLoader(manager).setDRACOLoader(draco).setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder).loadAsync(await transport(url));
      if (failed.length) { disposeModel(model); throw Error('Model dependencies failed: ' + failed.join(', ')); }
      return model;
    };
    const next = new ModelAssetStore(load);
    const original = new SelectedModelAssetStore(load, SELECTED_MODEL_BUDGET);
    const unsubscribeOriginal = original.subscribe(invalidate);
    const unsubscribe = next.subscribe(invalidate);
    setStores({ prepared: next, original });
    return () => { unsubscribe(); unsubscribeOriginal(); next.close(); original.close(); draco.dispose(); ktx.dispose(); };
  }, [gl, invalidate, transport]);
  useEffect(() => { if (retry) { store?.retry(); stores?.original.retry(); } }, [store, stores, retry]);
  useEffect(() => {
    if (!store || !onStatus) return;
    const notify = () => {
      const prepared = store.status(), original = stores!.original.status();
      onStatus({ total: prepared.total + original.total, ready: prepared.ready + original.ready,
        loading: prepared.loading + original.loading, bytes: prepared.bytes + original.bytes,
        triangles: prepared.triangles + original.triangles, errors: [...prepared.errors, ...original.errors] });
    };
    notify();
    const off = store.subscribe(notify), offOriginal = stores!.original.subscribe(notify);
    return () => { off(); offOriginal(); };
  }, [store, stores, onStatus]);
  return <Context.Provider value={store}><SelectedContext.Provider value={stores?.original}>{children}</SelectedContext.Provider></Context.Provider>;
}
const noopSubscribe = () => () => {};
const zero = () => 0;
export function useModelAsset(url: string | undefined, priority: number, renderPriority = priority) {
  return useAssetFromStore(useContext(Context), url, priority, renderPriority);
}
export function useSelectedModelAsset(url: string | undefined) {
  return useAssetFromStore(useContext(SelectedContext), url, 4000, 4000);
}
function useAssetFromStore(store: ModelAssetStore | undefined, url: string | undefined, priority: number, renderPriority: number) {
  const [claim] = useState(() => Symbol(url));
  useSyncExternalStore(store?.subscribe ?? noopSubscribe, store?.snapshot ?? zero);
  useEffect(() => url && store ? store.acquire(url, priority, claim, renderPriority) : undefined, [store, url, priority, renderPriority, claim]);
  return url ? store?.get(url, claim) : undefined;
}
