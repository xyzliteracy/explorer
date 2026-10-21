import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamingModel } from './ModelPrimitive';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { useModelAsset, useOriginalModelAsset, useModelPresentation } from '../performance/ModelRuntime';
vi.mock('react', async original => ({ ...(await original<typeof import('react')>()), useEffect: vi.fn() }));
vi.mock('../performance/ModelRuntime', () => ({ useOriginalModelAsset: vi.fn(), useModelAsset: vi.fn(), useModelPresentation: vi.fn(), useModelSceneRevealed: () => true }));
vi.mock('../assets', () => ({ useAssetResolver: () => (source: string) => new URL(source, 'http://localhost/').href }));
const nodeFor = (properties = '') => createSpatialDocument(`"Chair/+0+1/+0+1/+0+1":"model: chair.glb; ${properties}"`).renderNodes[0];
beforeEach(() => { vi.mocked(useModelAsset).mockReset().mockReturnValue(undefined); vi.mocked(useOriginalModelAsset).mockReset().mockReturnValue(undefined); vi.mocked(useModelPresentation).mockClear(); });
describe('stable model presentation', () => {
  it.each(['none', 'standard', 'detail'] as const)('uses one stable textured detail baseline at %s', tier => {
    expect(StreamingModel({ node: nodeFor(), tier, resolved: false, selected: false })).toBeNull();
    expect(useModelAsset).toHaveBeenNthCalledWith(1, 'http://localhost/chair.detail.glb', 2000);
    expect(useModelAsset).toHaveBeenNthCalledWith(2, undefined, 2000);
    expect(useModelPresentation).toHaveBeenLastCalledWith(false, undefined);
  });
  it('only requests preview when explicitly given the critical-device tier', () => {
    StreamingModel({ node: nodeFor(), tier: 'preview', resolved: false, selected: false });
    expect(useModelAsset).toHaveBeenNthCalledWith(1, 'http://localhost/chair.preview.glb', 2000);
  });
  it.each(['preview', 'detail'] as const)('falls back directly to the author source after a missing %s', tier => {
    vi.mocked(useModelAsset).mockImplementation(url => url && !url.endsWith('/chair.glb') ? { error: Error('404'), bytes: 0, triangles: 0 } : undefined);
    StreamingModel({ node: nodeFor('model-detail: chair.high.glb'), tier, resolved: false, selected: false });
    expect(useModelAsset).toHaveBeenNthCalledWith(2, 'http://localhost/chair.glb', 2000);
    expect(useModelPresentation).toHaveBeenLastCalledWith(false, undefined);
  });
  it('reports a terminal source failure as a scene-level error', () => {
    const error = Error('offline');
    vi.mocked(useModelAsset).mockReturnValue({ error, bytes: 0, triangles: 0 });
    expect(StreamingModel({ node: nodeFor(), tier: 'detail', resolved: false, selected: false })).toBeNull();
    expect(useModelPresentation).toHaveBeenLastCalledWith(false, error);
  });
  it('baseline remains stable across selection and tour props', () => {
    const model = { scene: { name: 'full-quality' } } as unknown as GLTF;
    vi.mocked(useModelAsset).mockReturnValue({ value: model, bytes: 10, triangles: 10 });
    for (const selected of [false, true, false]) {
      const rendered = StreamingModel({ node: nodeFor(), tier: 'detail', resolved: false, selected, tourMode: true, tourOriginal: selected });
      expect(rendered?.props.scene).toBe(model.scene);
    }
    expect(useModelAsset).toHaveBeenCalledTimes(6);
    expect(useModelPresentation).toHaveBeenLastCalledWith(true, undefined);
  });
});

it('prefetches originals separately and retains detail until the original is ready', () => {
  const detail = { scene: { name: 'detail' } } as unknown as GLTF;
  const original = { scene: { name: 'original' } } as unknown as GLTF;
  vi.mocked(useModelAsset).mockImplementation(url => url?.endsWith('.detail.glb') ? { value: detail, bytes: 1, triangles: 1 } : undefined);
  const props = { node: nodeFor(), tier: 'detail' as const, resolved: false, selected: false, originalNeeded: true };
  expect(StreamingModel(props)?.props.scene).toBe(detail.scene);
  expect(useOriginalModelAsset).toHaveBeenLastCalledWith('http://localhost/chair.glb', 1000);
  vi.mocked(useOriginalModelAsset).mockReturnValue({ value: original, bytes: 1, triangles: 1 });
  expect(StreamingModel(props)?.props.scene).toBe(original.scene);
});
