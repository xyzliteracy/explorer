import { describe, expect, it } from 'vitest';
import { createSpatialDocument } from '../model/createSpatialDocument';
describe('shared model level declarations', () => {
  it('inherits preview/detail and keeps them when changing fitting only', () => {
    const result = createSpatialDocument('"Chair/":"model: chair.glb; model-preview: chair.low.glb; model-detail: chair.high.glb"\n"Chair/+0+1/+0+1/+0+1":"model-fit: stretch"');
    expect(result.diagnostics).toEqual([]);
    expect(result.renderNodes[0].model).toMatchObject({ source: 'chair.glb', previewSource: 'chair.low.glb', detailSource: 'chair.high.glb', fit: 'stretch' });
  });
  it('does not inherit another model’s levels after a source override', () => {
    const result = createSpatialDocument('"Chair/":"model: chair.glb; model-preview: chair.low.glb; model-detail: chair.high.glb"\n"Chair/+0+1/+0+1/+0+1":"model: table.glb"');
    expect(result.diagnostics).toEqual([]);
    expect(result.renderNodes[0].model?.previewSource).toBeUndefined();
    expect(result.renderNodes[0].model?.detailSource).toBeUndefined();
  });
  it('rejects escaping paths and levels without an effective source', () => {
    expect(createSpatialDocument('"Box/+0+1/+0+1/+0+1":"model: box.glb; model-preview: ../secret.glb"').diagnostics.length).toBeGreaterThan(0);
    expect(createSpatialDocument('"Box/+0+1/+0+1/+0+1":"model-detail: detail.glb"').diagnostics.length).toBeGreaterThan(0);
  });
});
