import { createContext, useContext, useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { LoadingManager } from 'three';
import { Html } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ModelAssetStore, type AssetStatus } from './ModelAssetStore';
import { SelectedModelAssetStore, SELECTED_MODEL_BUDGET } from './SelectedModelAssetStore';
import { disposeModel, modelResources } from './modelResources';
import { criticallyUnderpoweredDevice } from './renderQuality';

const Context = createContext<ModelAssetStore | undefined>(undefined);
const SelectedContext = createContext<ModelAssetStore | undefined>(undefined);
const direct = async (url: string) => url;
export const PERFORMANCE_CANVAS = { frameloop: 'demand' as const, dpr: [1, 1.5] as [number, number], shadows: false, gl: { antialias: true } };

type Presentation = { ready: boolean; error?: Error };
class Presentations {
  entries = new Map<symbol, Presentation>();
  listeners = new Set<() => void>();
  version = 0;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.version;
  changed() { this.version++; this.listeners.forEach(listener => listener()); }
}
const RevealedContext = createContext(false);
export function useModelSceneRevealed() { return useContext(RevealedContext); }
export function useModelMemoryPressure() {
  const store = useContext(Context);
  useSyncExternalStore(store?.subscribe ?? noopSubscribe, store?.snapshot ?? zero);
  return Boolean(store && store.status().bytes > store.budget.bytes);
}
const RecoveryContext = createContext(0);
export function useModelRetryGeneration() { return useContext(RecoveryContext); }
const PresentationContext = createContext<Presentations | undefined>(undefined);
/** Report rendered readiness, rather than counting failed optional requests. */
export function useModelPresentation(ready: boolean, error?: Error) {
  const registry = useContext(PresentationContext);
  const [id] = useState(() => Symbol());
  useLayoutEffect(() => {
    if (!registry) return;
    registry.entries.set(id, { ready, error }); registry.changed();
    return () => { registry.entries.delete(id); registry.changed(); };
  }, [registry, id, ready, error]);
}
function ModelPreparation({ registry, initialized, retry, onRevealed }: { registry: Presentations; initialized: boolean; retry: () => void; onRevealed: () => void }) {
  const revision = useSyncExternalStore(registry.subscribe, registry.snapshot);
  const { gl, scene, camera, invalidate } = useThree();
  const entries = [...registry.entries.values()];
  const pending = !initialized || entries.some(entry => !entry.ready);
  const failed = entries.find(entry => entry.error)?.error;
  const [preparedRevision, setPreparedRevision] = useState(-1);
  const [preparationError, setPreparationError] = useState<Error>();
  useEffect(() => {
    if (pending) { setPreparedRevision(-1); return; }
    let cancelled = false;
    let frame = 0;
    setPreparationError(undefined);
    // Initialize textures including offscreen models before revealing the room.
    const resources = modelResources({ scenes: [scene] });
    void Promise.resolve().then(() => {
      if (cancelled) return;
      resources.textures.forEach(texture => gl.initTexture(texture));
      return gl.compileAsync(scene, camera);
    }).then(() => {
      if (cancelled) return;
      invalidate();
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => { if (!cancelled) { setPreparedRevision(revision); onRevealed(); } });
      });
    }).catch(reason => { if (!cancelled) setPreparationError(reason instanceof Error ? reason : Error(String(reason))); });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [pending, revision, gl, scene, camera, invalidate, onRevealed]);
  if (!pending && preparedRevision === revision) return null;
  return <Html fullscreen style={{ pointerEvents: 'auto' }}><div role="status" aria-live="polite" data-model-preparation
    style={{ position: 'absolute', inset: 0, background: '#151820', color: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
    {failed || preparationError ? <><span>The scene could not be prepared. Retry, or check its model assets.</span><button onClick={retry}>Retry models</button></> : <span>Preparing your scene…</span>}
  </div></Html>;
}

export function ModelRuntime({ children, transport = direct, onStatus, retry = 0 }: { children: ReactNode; retry?: number; transport?: (url: string) => Promise<string>; onStatus?: (status: AssetStatus) => void }) {
  const { gl, scene, camera, invalidate, setFrameloop } = useThree();
  const [presentations] = useState(() => new Presentations());
  const [recovery, setRecovery] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const onRevealed = useCallback(() => setRevealed(true), []);
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); setContextLost(true); };
    const restored = () => { setContextLost(false); invalidate(); };
    gl.domElement.addEventListener('webglcontextlost', lost);
    gl.domElement.addEventListener('webglcontextrestored', restored);
    return () => {
      gl.domElement.removeEventListener('webglcontextlost', lost);
      gl.domElement.removeEventListener('webglcontextrestored', restored);
    };
  }, [gl, invalidate]);
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
      try {
        model.scene.userData.xyzAssetUrl = url;
        modelResources(model).textures.forEach(texture => gl.initTexture(texture));
        await gl.compileAsync(model.scene, camera, scene);
        return model;
      } catch (error) { disposeModel(model); throw error; }
    };
    const critical = criticallyUnderpoweredDevice();
    const next = new ModelAssetStore(load, {
      bytes: (critical ? 128 : 512) * 1024 * 1024, triangles: Infinity,
      concurrent: 1, idleMs: 5000,
    }, undefined, undefined, true);
    const original = new SelectedModelAssetStore(load, SELECTED_MODEL_BUDGET);
    const unsubscribeOriginal = original.subscribe(invalidate);
    const unsubscribe = next.subscribe(invalidate);
    setStores({ prepared: next, original });
    return () => { unsubscribe(); unsubscribeOriginal(); next.close(); original.close(); draco.dispose(); ktx.dispose(); };
  }, [gl, invalidate, transport]);
  useEffect(() => { if (retry) { store?.retry(); stores?.original.retry(); setRecovery(value => value + 1); } }, [store, stores, retry]);
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
  return <Context.Provider value={store}><SelectedContext.Provider value={stores?.original}>
    <RevealedContext.Provider value={revealed}><RecoveryContext.Provider value={recovery}><PresentationContext.Provider value={presentations}>{children}
      <ModelPreparation registry={presentations} initialized={Boolean(store) && !contextLost} onRevealed={onRevealed} retry={() => { store?.retry(); stores?.original.retry(); setRecovery(value => value + 1); }} />
    </PresentationContext.Provider></RecoveryContext.Provider></RevealedContext.Provider>
  </SelectedContext.Provider></Context.Provider>;
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
