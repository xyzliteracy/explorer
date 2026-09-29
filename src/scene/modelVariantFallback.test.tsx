import { describe, expect, it, vi } from 'vitest';
import { StreamingModel } from './ModelPrimitive';
import { createSpatialDocument } from '../model/createSpatialDocument';
import { useModelAsset } from '../performance/ModelRuntime';
vi.mock('../performance/ModelRuntime', () => ({ useModelAsset: vi.fn() }));
vi.mock('@react-three/drei', () => ({ Html: () => null }));

describe('streaming variant fallback', () => {
  it.each(['preview', 'detail'] as const)('loads the base after a missing inferred %s', tier => {
    vi.mocked(useModelAsset).mockReset().mockImplementation(url => url?.includes(`.${tier}.glb`) ? { error: Error('404'), bytes: 0, triangles: 0 } : undefined);
    const node = createSpatialDocument('"Chair/+0+1/+0+1/+0+1":"model: https://example.com/chair.glb"').renderNodes[0];
    StreamingModel({ node, tier, resolved: true, selected: false });
    expect(vi.mocked(useModelAsset).mock.calls[2][0]).toBe('https://example.com/chair.glb');
  });
  it('does not replace an explicit detail URL after failure', () => {
    vi.mocked(useModelAsset).mockReset().mockReturnValue({ error: Error('404'), bytes: 0, triangles: 0 });
    const node = createSpatialDocument('"Chair/+0+1/+0+1/+0+1":"model: https://example.com/chair.glb; model-detail: https://example.com/custom.glb"').renderNodes[0];
    StreamingModel({ node, tier: 'detail', resolved: true, selected: false });
    expect(vi.mocked(useModelAsset).mock.calls[2][0]).toBeUndefined();
  });
});
