// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ModelRuntime, useModelAsset, useOriginalModelAsset, useModelPresentation } from './ModelRuntime';
const mock = vi.hoisted(() => ({ load: vi.fn(), parse: vi.fn(), init: vi.fn(), compile: vi.fn(() => new Set()), canvas: undefined as HTMLCanvasElement | undefined, scene: undefined as Scene | undefined, state: undefined as any }));
vi.mock('@react-three/fiber', () => ({ useThree: () => mock.state }));
vi.mock('@react-three/drei', () => ({ Html: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({ GLTFLoader: class {
  setDRACOLoader() { return this; } setKTX2Loader() { return this; } setMeshoptDecoder() { return this; }
  loadAsync = mock.load; parseAsync = mock.parse;
} }));
vi.mock('three/examples/jsm/loaders/DRACOLoader.js', () => ({ DRACOLoader: class {
  setDecoderPath() { return this; } setWorkerLimit() { return this; } dispose() {}
} }));
vi.mock('three/examples/jsm/loaders/KTX2Loader.js', () => ({ KTX2Loader: class {
  setTranscoderPath() { return this; } setWorkerLimit() { return this; } detectSupport() { return this; } dispose() {}
} }));
function Probe() {
  const asset = useModelAsset('chair.detail.glb', 2000);
  useModelPresentation(Boolean(asset?.value), asset?.error);
  return <span>{asset?.value ? 'ready' : 'loading'}</span>;
}
function model() {
  const scene = new Group(), geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  scene.add(new Mesh(geometry, material));
  return { value: { scene, scenes: [scene], parser: { retains: 'loading buffers' } } as unknown as GLTF, dispose: vi.spyOn(geometry, 'dispose') };
}
beforeEach(() => {
  vi.stubGlobal('navigator', { deviceMemory: 8, userAgent: 'Chrome', hardwareConcurrency: 8 });
  mock.canvas = document.createElement('canvas'); mock.scene = new Scene(); mock.load.mockReset(); mock.parse.mockReset(); mock.init.mockClear(); mock.compile.mockClear();
  mock.state = { gl: { domElement: mock.canvas, initTexture: mock.init, compile: mock.compile, properties: { get: () => ({ currentProgram: { isReady: () => true } }) }, getContext: () => ({ isContextLost: () => false }) }, scene: mock.scene, camera: {}, invalidate: () => {}, setFrameloop: () => {} };
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('disposes a decode completing after unmount without warming the old renderer', async () => {
  let finish!: (value: GLTF) => void; mock.load.mockImplementation(() => new Promise<GLTF>(resolve => { finish = resolve; }));
  const view = render(<ModelRuntime><Probe /></ModelRuntime>);
  await waitFor(() => expect(mock.load).toHaveBeenCalledOnce());
  view.unmount(); const result = model(); await act(async () => { finish(result.value); await Promise.resolve(); });
  expect(result.dispose).toHaveBeenCalledOnce(); expect(mock.init).not.toHaveBeenCalled(); expect(mock.compile).not.toHaveBeenCalled();
});
it('does not start GLTF decoding when transport resolves after page departure', async () => {
  let finish!: (value: string) => void; const transport = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
  render(<ModelRuntime transport={transport}><Probe /></ModelRuntime>);
  await waitFor(() => expect(transport).toHaveBeenCalledOnce());
  await act(async () => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })); finish('late.glb'); });
  expect(mock.load).not.toHaveBeenCalled(); expect(mock.init).not.toHaveBeenCalled();
});
it('pauses a context-lost load, disposes its stale result and recovers cleanly', async () => {
  let finish!: (value: GLTF) => void; const stale = model(), healthy = model();
  mock.load.mockImplementationOnce(() => new Promise<GLTF>(resolve => { finish = resolve; })).mockResolvedValue(healthy.value);
  const view = render(<ModelRuntime><Probe /></ModelRuntime>);
  await waitFor(() => expect(mock.load).toHaveBeenCalledOnce());
  await act(async () => { mock.canvas!.dispatchEvent(new Event('webglcontextlost', { cancelable: true })); finish(stale.value); });
  expect(stale.dispose).toHaveBeenCalledOnce(); expect(mock.compile).not.toHaveBeenCalled(); expect(mock.load).toHaveBeenCalledOnce();
  await act(async () => { mock.canvas!.dispatchEvent(new Event('webglcontextrestored')); });
  await waitFor(() => expect(view.getByText('ready')).toBeTruthy());
  expect(mock.load).toHaveBeenCalledTimes(2); expect(healthy.value.parser).toBeUndefined();
});

function originalBuffer() {
  const text = new TextEncoder().encode('{"accessors":[],"images":[]}');
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const buffer = new ArrayBuffer(32 + jsonLength); const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer, 20, jsonLength).fill(32); new Uint8Array(buffer, 20, text.length).set(text);
  view.setUint32(20 + jsonLength, 4, true); view.setUint32(24 + jsonLength, 0x004e4942, true);
  return buffer;
}
function GrantedProbe({ extra = false, fallback = false }: { extra?: boolean; fallback?: boolean }) {
  const asset = useModelAsset(fallback ? 'chair.glb' : 'chair.detail.glb', 2000);
  const original = useOriginalModelAsset(fallback ? undefined : 'chair.glb');
  useModelPresentation(Boolean(asset?.value), asset?.error);
  return <><span>{original?.value ? 'original granted' : 'detail only'}</span><span>{asset?.value ? 'baseline ready' : 'baseline loading'}</span>{extra && <Extra />}</>;
}
function Extra() { const asset = useModelAsset('new.detail.glb', 2000); useModelPresentation(Boolean(asset?.value), asset?.error); return null; }
it('keeps an existing visible original grant while another baseline loads', async () => {
  const base = model(), original = model(), extra = model(); let finish!: (value: GLTF) => void;
  mock.load.mockResolvedValueOnce(base.value).mockImplementation(() => new Promise<GLTF>(resolve => { finish = resolve; }));
  mock.parse.mockResolvedValue(original.value); vi.stubGlobal('fetch', vi.fn(async () => new Response(originalBuffer())));
  const view = render(<ModelRuntime><GrantedProbe /></ModelRuntime>);
  await waitFor(() => expect(view.getByText('original granted')).toBeTruthy());
  view.rerender(<ModelRuntime><GrantedProbe extra /></ModelRuntime>);
  await waitFor(() => expect(mock.load).toHaveBeenCalledTimes(2));
  expect(view.getByText('original granted')).toBeTruthy(); expect(original.dispose).not.toHaveBeenCalled();
  await act(async () => { finish(extra.value); });
  expect(view.getByText('original granted')).toBeTruthy();
});
it('loads a required fallback even when its URL previously belonged to the optional cache', async () => {
  const base = model(), original = model(), fallback = model();
  mock.load.mockResolvedValueOnce(base.value).mockResolvedValue(fallback.value);
  mock.parse.mockResolvedValue(original.value); vi.stubGlobal('fetch', vi.fn(async () => new Response(originalBuffer())));
  const view = render(<ModelRuntime><GrantedProbe /></ModelRuntime>);
  await waitFor(() => expect(view.getByText('original granted')).toBeTruthy());
  view.rerender(<ModelRuntime><GrantedProbe fallback /></ModelRuntime>);
  await waitFor(() => expect(mock.load).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(view.getByText('baseline ready')).toBeTruthy());
  expect(mock.load).toHaveBeenLastCalledWith('chair.glb');
});
