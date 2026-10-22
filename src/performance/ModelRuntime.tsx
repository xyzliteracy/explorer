import { createContext, useContext, useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { LoadingManager, LoaderUtils } from 'three';
import { Html } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ModelDownloadBudget } from './ModelDownloadBudget';
import { ModelAssetStore, ModelCapacityError, type AssetStatus } from './ModelAssetStore';
import { currentModelUpgradePolicy, inspectOriginalGlb } from './modelUpgradeMemory';
import { disposeModel, estimateModel, modelResources } from './modelResources';
import { compileModel } from './compileModel';
import { criticallyUnderpoweredDevice } from './renderQuality';
import { readSafeRendering, rememberSafeRendering } from './renderBudget';

const Context = createContext<ModelAssetStore | undefined>(undefined);
const SelectedContext = createContext<ModelAssetStore | undefined>(undefined);
const direct = async (url: string) => url;
export const PERFORMANCE_CANVAS = { frameloop: 'demand' as const, dpr: [1, 1.5] as [number, number], shadows: true, gl: { antialias: true } };

const SafeRendering = createContext(false);
export const useSafeRendering = () => useContext(SafeRendering);
export type PreparationStatus = 'loading' | 'ready' | 'error' | 'context-lost';

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
  const originals = useContext(SelectedContext);
  useSyncExternalStore(originals?.subscribe ?? noopSubscribe, originals?.snapshot ?? zero);
  return Boolean(store && originals && (store.status().bytes + originals.status().bytes > store.budget.bytes || originals.status().bytes >= originals.budget.bytes * .8));
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
function ModelPreparation({ registry, initialized, retry, onRevealed, onPreparation, contextLost, generation }: { generation: number; onPreparation?: (status: PreparationStatus) => void; contextLost: boolean; registry: Presentations; initialized: boolean; retry: () => void; onRevealed: () => void }) {
  const revision = useSyncExternalStore(registry.subscribe, registry.snapshot);
  const { gl, scene, camera, invalidate } = useThree();
  const entries = [...registry.entries.values()];
  const [restoring, setRestoring] = useState(false);
  useEffect(() => { if (contextLost) setRestoring(true); }, [contextLost]);
  // Recover the models already present, without waiting for unrelated downloads.
  const pending = !initialized || (!restoring && entries.some(entry => !entry.ready));
  const failed = entries.find(entry => entry.error)?.error;
  const [preparedRevision, setPreparedRevision] = useState(-1);
  const [preparationError, setPreparationError] = useState<Error>();
  useEffect(() => {
    if (pending) { setPreparedRevision(-1); return; }
    let cancelled = false;
    const controller = new AbortController();
    let frame = 0;
    setPreparationError(undefined);
    setPreparedRevision(-1);
    // Rewarm after context recovery; initial models are already prepared individually.
    // This status work never gates scene visibility.
    const resources = modelResources({ scenes: [scene] });
    void Promise.resolve().then(() => {
      if (cancelled) return;
      resources.textures.forEach(texture => gl.initTexture(texture));
      return compileModel(gl, scene, camera, controller.signal);
    }).then(() => {
      if (cancelled) return;
      invalidate();
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => { if (!cancelled) { setPreparedRevision(revision); setRestoring(false); onRevealed(); } });
      });
    }).catch(reason => { if (!cancelled) setPreparationError(reason instanceof Error ? reason : Error(String(reason))); });
    return () => { cancelled = true; controller.abort(); cancelAnimationFrame(frame); };
  }, [pending, revision, generation, gl, scene, camera, invalidate, onRevealed]);
  const status: PreparationStatus = contextLost || restoring ? 'context-lost' : failed || preparationError ? 'error' : !pending && preparedRevision === revision ? 'ready' : 'loading';
  useEffect(() => { onPreparation?.(status); }, [onPreparation, status]);
  if (onPreparation || status === 'ready' || status === 'loading') return null;
  const recovering = status === 'context-lost';
  return <Html fullscreen={recovering} style={{ pointerEvents: recovering ? 'auto' : 'none' }}>
    <div role={recovering ? 'status' : 'alert'} data-model-preparation={recovering ? 'context-lost' : undefined} data-model-error={recovering ? undefined : true}
      style={{ pointerEvents: 'auto', background: '#151820', color: '#f3f4f6', padding: 16, borderRadius: 8 }}>
      <span>{recovering ? 'Graphics were interrupted. Recovering…' : 'Some models could not be loaded.'}</span>
      <button onClick={retry}>Retry models</button>
    </div>
  </Html>;
}

export function ModelRuntime({ children, transport = direct, onStatus, onPreparation, retry = 0 }: { onPreparation?: (status: PreparationStatus) => void; children: ReactNode; retry?: number; transport?: (url: string) => Promise<string>; onStatus?: (status: AssetStatus) => void }) {
  const { gl, scene, camera, invalidate, setFrameloop, setDpr } = useThree();
  const [presentations] = useState(() => new Presentations());
  const [recovery, setRecovery] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const [safeRendering, setSafeRendering] = useState(readSafeRendering);
  useLayoutEffect(() => {
    if (safeRendering) { gl.shadowMap.enabled = false; setDpr(1); }
  }, [safeRendering, gl, setDpr]);
  const [revealed, setRevealed] = useState(false);
  const onRevealed = useCallback(() => setRevealed(true), []);
  useEffect(() => {
    const lost = (event: Event) => {
      event.preventDefault(); rememberSafeRendering(); setSafeRendering(true); setRevealed(false); setContextLost(true);
      // Disable synchronously: a restored context must not allocate the old atlases.
      gl.shadowMap.enabled = false;
      console.warn('Viewer WebGL context lost; recovering without shadows.');
    };
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
  const [stores, setStores] = useState<{ prepared: ModelAssetStore; original: ModelAssetStore }>();
  const store = stores?.prepared;
  useEffect(() => {
    const root = new URL('decoders/', new URL(import.meta.env.BASE_URL, location.href)).href;
    const draco = new DRACOLoader().setDecoderPath(root + 'draco/').setWorkerLimit(1);
    const ktx = new KTX2Loader().setTranscoderPath(root + 'basis/').setWorkerLimit(1).detectSupport(gl);
    const policy = currentModelUpgradePolicy();
    let stopped = false;
    let suspended = false;
    let serial = Promise.resolve();
    const managers = new Set<LoadingManager>();
    const controllers = new Set<AbortController>();
    const costs = new Map<string, ReturnType<typeof inspectOriginalGlb>>();
    type Download = { buffer: ArrayBuffer; url: string; release: () => void };
    const buffers = new Map<string, Download>();
    const downloads = new ModelDownloadBudget(policy.download);
    // A completed decode may still be awaiting store publication. Count it
    // until the synchronous estimator transfers ownership to the store.
    const pendingCosts = new Map<object, { cost: ReturnType<typeof estimateModel>; optional: boolean }>();
    const pendingBytes = (optionalOnly = false) => [...pendingCosts.values()].reduce((sum, entry) => sum + (!optionalOnly || entry.optional ? entry.cost.bytes : 0), 0);
    const publishCost = (model: Parameters<typeof estimateModel>[0]) => { const cost = pendingCosts.get(model)?.cost ?? estimateModel(model); pendingCosts.delete(model); return cost; };
    const dispose = (model: Parameters<typeof disposeModel>[0]) => { pendingCosts.delete(model); disposeModel(model); };
    const clearBuffers = () => { buffers.forEach(item => item.release()); buffers.clear(); };
    const runSerial = <T,>(work: () => Promise<T>): Promise<T> => {
      const result = serial.then(work);
      serial = result.then(() => {}, () => {});
      return result;
    };
    const check = (signal?: AbortSignal) => {
      if (stopped || suspended || signal?.aborted || gl.getContext().isContextLost()) throw new DOMException('Model loading interrupted', 'AbortError');
    };
    const fetchOriginal = async (source: string) => {
      check();
      const controller = new AbortController(); controllers.add(controller);
      let release: (() => void) | undefined;
      try {
        const url = await transport(source); check(controller.signal);
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw Error(`Model request failed: ${response.status}`);
        const reader = response.body?.getReader();
        if (!reader) throw Error('Cannot safely stream this model.');
        // Content-Encoding may be hidden by CORS while Content-Length describes
        // compressed transfer bytes. Use GLB's decoded length from its prefix.
        const first = await reader.read(); check(controller.signal);
        if (!first.value || first.value.byteLength > policy.download) throw Error('Invalid model response.');
        const prefix = new DataView(first.value.buffer, first.value.byteOffset, first.value.byteLength);
        const glbLength = first.value.byteLength >= 12 && prefix.getUint32(0, true) === 0x46546c67 ? prefix.getUint32(8, true) : undefined;
        const lengthHint = Number(response.headers.get('content-length'));
        const sameOrigin = new URL(url, location.href).origin === location.origin;
        const reservation = glbLength ?? (sameOrigin && lengthHint > 0 && !response.headers.get('content-encoding') ? lengthHint : policy.download);
        release = await downloads.acquire(reservation, controller.signal);
        const chunks: Uint8Array[] = [first.value]; let length = first.value.byteLength;
        if (length > reservation) throw Error('Model response exceeds its declared size.');
        try {
          for (;;) {
            const { value, done } = await reader.read(); if (done) break;
            check(controller.signal); length += value.byteLength;
            if (length > reservation) throw Error('Original download exceeds the transient memory allowance.');
            chunks.push(value);
          }
        } catch (error) { await reader.cancel(); throw error; }
        const bytes = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        check(controller.signal);
        return { buffer: bytes.buffer, url, release };
      } catch (error) { release?.(); throw error; } finally { controller.abort(); controllers.delete(controller); }
    };
    const load = async (source: string, optional: boolean) => {
      // Fetch independently, then serialize only decode/upload work. A slow
      // response must not prevent a different model from reaching the screen.
      let buffered = optional ? buffers.get(source) : undefined;
      if (optional) buffers.delete(source);
      try {
        buffered ??= await fetchOriginal(source);
        return await runSerial(async () => {
          check();
          const manager = new LoadingManager(); managers.add(manager);
          const signal = manager.abortController.signal;
          const failed: string[] = []; manager.onError = url => failed.push(url);
          let model: Awaited<ReturnType<GLTFLoader['loadAsync']>> | undefined;
          try {
            const loader = new GLTFLoader(manager).setDRACOLoader(draco).setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder);

            const checkCapacity = (cost: { bytes: number; triangles: number }) => {
              if (optional) {
                if (!original.isReferenced(source)) throw new DOMException('Original no longer requested', 'AbortError');
                if (cost.bytes > policy.originals) throw Error('Original exceeds the safe upgrade allowance; retaining textured detail.');
                if (original.status().bytes + pendingBytes(true) + cost.bytes > original.budget.bytes || next.status().bytes + original.status().bytes + pendingBytes() + cost.bytes > policy.combined) throw new ModelCapacityError(cost);
              } else if (policy.constrained && next.status().bytes + original.status().bytes + pendingBytes() + cost.bytes > policy.combined) {
                throw Error('This scene exceeds the device model memory allowance. Use smaller textured detail assets.');
              }
            };
            if (optional) checkCapacity(costs.get(source)!);
            // Required original fallbacks use the same pre-decode safety checks on
            // constrained devices; a missing detail sibling cannot bypass the cap.
            if (optional || policy.constrained) {
              buffered ??= await fetchOriginal(source);
              checkCapacity(inspectOriginalGlb(buffered.buffer));
            }
            model = await loader.parseAsync(buffered!.buffer, LoaderUtils.extractUrlBase(buffered!.url));
            check(signal);
            if (failed.length) throw Error('Model dependencies failed: ' + failed.join(', '));
            const measured = estimateModel(model);
            checkCapacity(measured); pendingCosts.set(model, { cost: measured, optional });
            model.scene.userData.xyzAssetUrl = source;
            for (const texture of modelResources(model).textures) {
              check(signal); gl.initTexture(texture);
              // Yield between large uploads; never warm stale results on an old canvas.
              const image = texture.image as { width?: number; height?: number } | undefined;
              if ((image?.width ?? 0) * (image?.height ?? 0) >= 1024 * 1024) {
                await new Promise<void>((resolve, reject) => {
                  const abort = () => { cancelAnimationFrame(frame); signal.removeEventListener('abort', abort); reject(new DOMException('Upload interrupted', 'AbortError')); };
                  const frame = requestAnimationFrame(() => { signal.removeEventListener('abort', abort); resolve(); });
                  signal.addEventListener('abort', abort, { once: true });
                });
              }
            }
            check(signal); await compileModel(gl, model.scene, camera, signal, scene); check(signal);
            // The parser caches raw GLB buffers and unused decoded dependencies.
            // Scene consumers need the render result, not those loading caches.
            delete (model as Partial<typeof model>).parser;
            return model;
          } catch (error) { if (model) dispose(model); throw error; }
          finally { managers.delete(manager); }
        });
      } finally { buffered?.release(); }
    };
    const critical = criticallyUnderpoweredDevice();
    const next = new ModelAssetStore(url => load(url, false), {
      bytes: (critical ? 128 : policy.constrained ? 256 : 512) * 1024 * 1024, triangles: Infinity,
      concurrent: 2, idleMs: 5000,
    }, dispose, publishCost, true);
    const original = new ModelAssetStore(url => load(url, true), { bytes: policy.originals, triangles: Infinity, concurrent: 1, idleMs: 0 }, dispose, publishCost, false,
      async url => {
        check(); clearBuffers();
        let cost = costs.get(url);
        let buffered: Download | undefined;
        try {
          if (!cost) { buffered = await fetchOriginal(url); cost = inspectOriginalGlb(buffered.buffer); costs.set(url, cost); }
          if (cost.downloadBytes > policy.download || cost.bytes > policy.originals) throw Error('Original exceeds the safe upgrade allowance; retaining textured detail.');
          if (original.status().bytes + pendingBytes(true) + cost.bytes > original.budget.bytes || next.status().bytes + original.status().bytes + pendingBytes() + cost.bytes > policy.combined) throw new ModelCapacityError(cost);
          buffered ??= await fetchOriginal(url);
          check();
          if (!original.isReferenced(url)) throw new DOMException('Original no longer requested', 'AbortError');
          buffers.set(url, buffered);
        } catch (error) { buffered?.release(); throw error; }
      });
    const updateCapacity = () => {
      original.budget.bytes = Math.max(0, Math.min(policy.originals, policy.combined - next.status().bytes));
      original.refreshCapacity(); invalidate();
    };
    const unsubscribeOriginal = original.subscribe(() => {
      for (const [url, buffered] of buffers) if (!original.isReferenced(url)) { buffered.release(); buffers.delete(url); }
      invalidate();
    });
    const unsubscribe = next.subscribe(updateCapacity);
    const interrupt = () => { managers.forEach(manager => manager.abort()); controllers.forEach(controller => controller.abort()); clearBuffers(); };
    const pause = () => { suspended = true; next.setPaused(true); original.setPaused(true); interrupt(); };
    const resume = () => { if (stopped) return; suspended = false; next.retry(); original.retry(); next.setPaused(false); original.setPaused(false); invalidate(); };
    const stop = () => { if (stopped) return; stopped = true; next.setPaused(true); original.setPaused(true); interrupt(); next.close(); original.close(); draco.dispose(); ktx.dispose(); };
    const pageHide = (event: PageTransitionEvent) => { if (event.persisted) pause(); else { setFrameloop('never'); stop(); } };
    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) resume(); };
    gl.domElement.addEventListener('webglcontextlost', pause);
    gl.domElement.addEventListener('webglcontextrestored', resume);
    window.addEventListener('pagehide', pageHide); window.addEventListener('pageshow', pageShow);
    setStores({ prepared: next, original });
    return () => {
      unsubscribe(); unsubscribeOriginal(); stop(); costs.clear();
      gl.domElement.removeEventListener('webglcontextlost', pause); gl.domElement.removeEventListener('webglcontextrestored', resume);
      window.removeEventListener('pagehide', pageHide); window.removeEventListener('pageshow', pageShow);
    };
  }, [gl, invalidate, transport]);
  useEffect(() => { if (retry) { store?.retry(); stores?.original.retry(); setRecovery(value => value + 1); } }, [store, stores, retry]);
  useEffect(() => {
    if (!store || !onStatus) return;
    const notify = () => {
      const prepared = store.status(), original = stores!.original.status();
      onStatus({ total: prepared.total + original.total, ready: prepared.ready + original.ready,
        loading: prepared.loading + original.loading, bytes: prepared.bytes + original.bytes,
        triangles: prepared.triangles + original.triangles, errors: prepared.errors });
    };
    notify();
    const off = store.subscribe(notify), offOriginal = stores!.original.subscribe(notify);
    return () => { off(); offOriginal(); };
  }, [store, stores, onStatus]);
  return <SafeRendering.Provider value={safeRendering}><Context.Provider value={store}><SelectedContext.Provider value={stores?.original}>
    <RevealedContext.Provider value={revealed}><RecoveryContext.Provider value={recovery}><PresentationContext.Provider value={presentations}>{children}
      <ModelPreparation generation={recovery} contextLost={contextLost} onPreparation={onPreparation} registry={presentations} initialized={Boolean(store) && !contextLost} onRevealed={onRevealed} retry={() => { store?.retry(); stores?.original.retry(); setRecovery(value => value + 1); }} />
    </PresentationContext.Provider></RecoveryContext.Provider></RevealedContext.Provider>
  </SelectedContext.Provider></Context.Provider></SafeRendering.Provider>;
}
const noopSubscribe = () => () => {};
const zero = () => 0;
export function useModelAsset(url: string | undefined, priority: number, renderPriority = priority) {
  return useAssetFromStore(useContext(Context), url, priority, renderPriority);
}
/** Optional originals wait until the required textured scene is decoded. */
export function useOriginalModelAsset(url: string | undefined, priority = 1000) {
  const baseline = useContext(Context);
  useSyncExternalStore(baseline?.subscribe ?? noopSubscribe, baseline?.snapshot ?? zero);
  const originals = useContext(SelectedContext);
  useSyncExternalStore(originals?.subscribe ?? noopSubscribe, originals?.snapshot ?? zero);
  const status = baseline?.status();
  // Missing inferred siblings can coexist with healthy source fallbacks.
  // Protect an existing grant while another required model is being prepared.
  const enabled = Boolean(url && originals?.get(url)?.value) || Boolean(status && status.total > 0 && status.loading === 0);
  return useAssetFromStore(originals, enabled ? url : undefined, priority, priority);
}
export function useSelectedModelAsset(url: string | undefined) {
  return useAssetFromStore(useContext(SelectedContext), url, 4000, 4000);
}
function useAssetFromStore(store: ModelAssetStore | undefined, url: string | undefined, priority: number, renderPriority: number) {
  const [claim] = useState(() => Symbol(url));
  useSyncExternalStore(store?.subscribe ?? noopSubscribe, store?.snapshot ?? zero);
  // Priority changes reorder pending work without releasing a visible grant.
  useEffect(() => url && store ? store.acquire(url, priority, claim, renderPriority) : undefined, [store, url, claim]);
  useEffect(() => { if (url && store) store.updatePriority(url, claim, priority, renderPriority); }, [store, url, claim, priority, renderPriority]);
  return url ? store?.get(url, claim) : undefined;
}
