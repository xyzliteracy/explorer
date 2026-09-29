import { describe, expect, it, vi } from 'vitest';
import { StreamingModel } from './ModelPrimitive';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { useModelAsset } from '../performance/ModelRuntime';
vi.mock('../performance/ModelRuntime', () => ({ useModelAsset: vi.fn() }));
vi.mock('@react-three/drei', () => ({ Html: () => null }));

describe('streaming variant fallback', () => {
  it('fetches relative model variants from the runtime store', () => {
    vi.mocked(useModelAsset).mockReset().mockReturnValue(undefined);
    const node = createSpatialDocument('"Shelf/+0+1/+0+1/+0+1":"model: side_shelves.glb"').renderNodes[0];
    StreamingModel({ node, tier: 'detail', resolved: false, selected: false });
    const base = 'https://pub-70e24999b560412a8cf712bd468e82c2.r2.dev/';
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
    expect(vi.mocked(useModelAsset).mock.calls[1][0]).toBe('https://pub-70e24999b560412a8cf712bd468e82c2.r2.dev/side_shelves.standard.glb');
  });
  it('does not replace an explicit detail URL after failure', () => {
    vi.mocked(useModelAsset).mockReset().mockReturnValue({ error: Error('404'), bytes: 0, triangles: 0 });
    const node = createSpatialDocument('"Chair/+0+1/+0+1/+0+1":"model: https://example.com/chair.glb; model-detail: https://example.com/custom.glb"').renderNodes[0];
    StreamingModel({ node, tier: 'detail', resolved: true, selected: false });
    expect(vi.mocked(useModelAsset).mock.calls[2][0]).toBeUndefined();
  });
});
