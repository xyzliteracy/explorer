import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { StreamingModel } from './ModelPrimitive';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { useModelAsset, useSelectedModelAsset } from '../performance/ModelRuntime';
vi.mock('../performance/ModelRuntime', () => ({ useModelAsset: vi.fn(), useSelectedModelAsset: vi.fn() }));
vi.mock('../assets', () => ({ useAssetResolver: () => (source: string) => new URL(source, 'http://localhost/').href }));
vi.mock('@react-three/drei', () => ({ Html: () => null }));

describe('streaming variant fallback', () => {
  it('fetches relative model variants from the runtime store', () => {
    vi.mocked(useModelAsset).mockReset().mockReturnValue(undefined);
    const node = createSpatialDocument('"Shelf/+0+1/+0+1/+0+1":"model: side_shelves.glb"').renderNodes[0];
    StreamingModel({ node, tier: 'detail', resolved: false, selected: false });
    const base = 'http://localhost/';
    expect(vi.mocked(useModelAsset).mock.calls[0][0]).toBe(base + 'side_shelves.preview.glb');
    expect(vi.mocked(useModelAsset).mock.calls[1][0]).toBe(base + 'side_shelves.detail.glb');
  });
  it.each(['preview', 'detail'] as const)('loads the base after a missing inferred %s', tier => {
    vi.mocked(useModelAsset).mockReset().mockImplementation(url => url?.includes(`.${tier}.glb`) ? { error: Error('404'), bytes: 0, triangles: 0 } : undefined);
    const node = createSpatialDocument('"Chair/+0+1/+0+1/+0+1":"model: https://example.com/chair.glb"').renderNodes[0];
    StreamingModel({ node, tier, resolved: true, selected: false });
    expect(vi.mocked(useModelAsset).mock.calls[2][0]).toBe('https://example.com/chair.standard.glb');
  });
  it('loads the standard sibling for an unqualified model at the standard tier', () => {
    vi.mocked(useModelAsset).mockReset().mockReturnValue(undefined);
    const node = createSpatialDocument('"Shelf/+0+1/+0+1/+0+1":"model: side_shelves.glb"').renderNodes[0];
    StreamingModel({ node, tier: 'standard', resolved: false, selected: false });
    expect(vi.mocked(useModelAsset).mock.calls[1][0]).toBe('http://localhost/side_shelves.standard.glb');
  });
  it('does not replace an explicit detail URL after failure', () => {
    vi.mocked(useModelAsset).mockReset().mockReturnValue({ error: Error('404'), bytes: 0, triangles: 0 });
    const node = createSpatialDocument('"Chair/+0+1/+0+1/+0+1":"model: https://example.com/chair.glb; model-detail: https://example.com/custom.glb"').renderNodes[0];
    StreamingModel({ node, tier: 'detail', resolved: true, selected: false });
    expect(vi.mocked(useModelAsset).mock.calls[2][0]).toBeUndefined();
  });
});

it('requests the original only while selected, regardless of the prepared tier', () => {
  vi.mocked(useModelAsset).mockReset().mockReturnValue(undefined);
  vi.mocked(useSelectedModelAsset).mockClear();
  const node = createSpatialDocument('"Shelf/+0+1/+0+1/+0+1":"model: side_shelves.standard.glb"').renderNodes[0];
  StreamingModel({ node, tier: 'preview', resolved: false, selected: true });
  expect(useSelectedModelAsset).toHaveBeenLastCalledWith('http://localhost/side_shelves.glb');
  StreamingModel({ node, tier: 'preview', resolved: false, selected: false });
  expect(useSelectedModelAsset).toHaveBeenLastCalledWith(undefined);
});

it('retains prepared geometry on original failure and prefers a loaded original', () => {
  const prepared = { scene: { name: 'prepared' } } as unknown as GLTF;
  const original = { scene: { name: 'original' } } as unknown as GLTF;
  vi.mocked(useModelAsset).mockReset().mockReturnValue({ value: prepared, bytes: 1, triangles: 1 });
  const node = createSpatialDocument('"Shelf/+0+1/+0+1/+0+1":"model: side_shelves.glb"').renderNodes[0];
  vi.mocked(useSelectedModelAsset).mockReturnValue({ error: Error('404'), bytes: 0, triangles: 0 });
  expect(StreamingModel({ node, tier: 'standard', resolved: false, selected: true }).props.scene).toBe(prepared.scene);
  vi.mocked(useSelectedModelAsset).mockReturnValue({ value: original, bytes: 1, triangles: 1 });
  expect(StreamingModel({ node, tier: 'standard', resolved: false, selected: true }).props.scene).toBe(original.scene);
  vi.mocked(useSelectedModelAsset).mockReset();
});

it('uses sustained tour focus for originals, ignoring stale editor selection in tours', () => {
  vi.mocked(useModelAsset).mockReset().mockReturnValue(undefined);
  vi.mocked(useSelectedModelAsset).mockReset();
  const node = createSpatialDocument('"Shelf/+0+1/+0+1/+0+1":"model: side_shelves.glb"').renderNodes[0];
  StreamingModel({ node, tier: 'detail', resolved: false, selected: true, tourMode: true });
  expect(useSelectedModelAsset).toHaveBeenLastCalledWith(undefined);
  StreamingModel({ node, tier: 'detail', resolved: false, selected: false, tourMode: true, tourOriginal: true });
  expect(useSelectedModelAsset).toHaveBeenLastCalledWith('http://localhost/side_shelves.glb');
});
