import { describe, expect, it } from 'vitest';
import { modelVariantSource, resolveModelVariants } from './modelVariants';
import { createSpatialDocument } from './createSpatialDocument';

describe('automatic model variants', () => {
  it.each(['chair.glb', 'chair.standard.glb', 'chair.preview.glb', 'chair.detail.glb'])(
    'resolves the prepared siblings of %s', source => {
      expect(resolveModelVariants({ source })).toEqual({ source, previewSource: 'chair.preview.glb', detailSource: 'chair.detail.glb' });
    },
  );
  it('preserves directories, URL parameters and fragments', () => {
    expect(modelVariantSource('https://example.com/models.v2/Chair.GLB?v=2#part', 'detail')).toBe('https://example.com/models.v2/Chair.detail.glb?v=2#part');
    expect(modelVariantSource('xyz-asset://scene/chair.standard.glb', 'preview')).toBe('xyz-asset://scene/chair.preview.glb');
  });
  it('preserves explicit variants independently', () => {
    expect(resolveModelVariants({ source: 'chair.glb', previewSource: 'custom.glb' })).toEqual({ source: 'chair.glb', previewSource: 'custom.glb', detailSource: 'chair.detail.glb' });
  });
  it('infers from the final inherited source without changing declarations', () => {
    const document = createSpatialDocument('"Chair/":"model: chair.glb; model-preview: custom.glb"\n"Chair/+0+1/+0+1/+0+1":"model: table.glb"');
    const model = document.renderNodes[0].model!;
    expect(resolveModelVariants(model)).toMatchObject({ source: 'table.glb', previewSource: 'table.preview.glb', detailSource: 'table.detail.glb' });
    expect(model.previewSource).toBeUndefined();
  });
});
