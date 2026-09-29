import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { LoadingManager } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ModelAssetStore, type AssetStatus } from './ModelAssetStore';
import { disposeModel } from './modelResources';

const Context = createContext<ModelAssetStore | undefined>(undefined);
const direct = async (url: string) => url;
export const PERFORMANCE_CANVAS = { frameloop: 'demand' as const, dpr: [1, 1.5] as [number, number], shadows: false, gl: { antialias: false } };

export function ModelRuntime({ children, transport = direct, onStatus, retry = 0 }: { children: ReactNode; retry?: number; transport?: (url: string) => Promise<string>; onStatus?: (status: AssetStatus) => void }) {
  const { gl, invalidate, setFrameloop } = useThree();
  useEffect(() => {
    const visibility = () => { setFrameloop(document.hidden ? 'never' : 'demand'); if (!document.hidden) invalidate(); };
    document.addEventListener('visibilitychange', visibility); visibility();
    return () => document.removeEventListener('visibilitychange', visibility);
  }, [invalidate, setFrameloop]);
  const [store, setStore] = useState<ModelAssetStore>();
  useEffect(() => {
    const root = new URL('decoders/', new URL(import.meta.env.BASE_URL, location.href)).href;
    const draco = new DRACOLoader().setDecoderPath(root + 'draco/').setWorkerLimit(1);
    const ktx = new KTX2Loader().setTranscoderPath(root + 'basis/').setWorkerLimit(1).detectSupport(gl);
    const next = new ModelAssetStore(async url => {
      const manager = new LoadingManager();
      const failed: string[] = [];
      manager.onError = url => failed.push(url);
      const model = await new GLTFLoader(manager).setDRACOLoader(draco).setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder).loadAsync(await transport(url));
      if (failed.length) { disposeModel(model); throw Error('Model dependencies failed: ' + failed.join(', ')); }
      return model;
    });
    const unsubscribe = next.subscribe(invalidate);
    setStore(next);
    return () => { unsubscribe(); next.close(); draco.dispose(); ktx.dispose(); };
  }, [gl, invalidate, transport]);
  useEffect(() => { if (retry) store?.retry(); }, [store, retry]);
  useEffect(() => {
    if (!store || !onStatus) return;
    const notify = () => onStatus(store.status());
    notify(); return store.subscribe(notify);
  }, [store, onStatus]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
const noopSubscribe = () => () => {};
const zero = () => 0;
export function useModelAsset(url: string | undefined, priority: number, renderPriority = priority) {
  const store = useContext(Context);
  const [claim] = useState(() => Symbol(url));
  useSyncExternalStore(store?.subscribe ?? noopSubscribe, store?.snapshot ?? zero);
  useEffect(() => url && store ? store.acquire(url, priority, claim, renderPriority) : undefined, [store, url, priority, renderPriority, claim]);
  return url ? store?.get(url, claim) : undefined;
}
