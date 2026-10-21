import { describe, expect, it } from 'vitest';
import { modelVariantSource, originalModelSource, resolveModelVariants } from './modelVariants';
import { createSpatialDocument } from './createSpatialDocument';

describe('automatic model variants', () => {
  it.each(['chair.glb', 'chair.standard.glb', 'chair.preview.glb', 'chair.detail.glb'])(
    'resolves the prepared siblings of %s', source => {
      expect(resolveModelVariants({ source })).toEqual({ source: source === 'chair.glb' ? 'chair.standard.glb' : source, previewSource: 'chair.preview.glb', detailSource: 'chair.detail.glb' });
    },
  );
  it('preserves directories, URL parameters and fragments', () => {
    expect(modelVariantSource('https://example.com/models.v2/Chair.GLB?v=2#part', 'detail')).toBe('https://example.com/models.v2/Chair.detail.glb?v=2#part');
    expect(modelVariantSource('xyz-asset://scene/chair.standard.glb', 'preview')).toBe('xyz-asset://scene/chair.preview.glb');
  });
  it('normalizes absolute and native URLs while preserving query strings and fragments', () => {
    expect(resolveModelVariants({ source: 'chair.glb?reference=other.detail.glb' }).source).toBe('chair.standard.glb?reference=other.detail.glb');
    for (const prefix of ['https://example.com/models/', 'xyz-asset://scene/']) {
      expect(resolveModelVariants({ source: prefix + 'Chair.GLB?v=2#part' }).source).toBe(prefix + 'Chair.standard.glb?v=2#part');
    }
  });
  it('preserves explicit variants independently', () => {
    expect(resolveModelVariants({ source: 'chair.glb', previewSource: 'custom.glb' })).toEqual({ source: 'chair.standard.glb', previewSource: 'custom.glb', detailSource: 'chair.detail.glb' });
  });
  it('infers from the final inherited source without changing declarations', () => {
    const document = createSpatialDocument('"Chair/":"model: chair.glb; model-preview: custom.glb"\n"Chair/+0+1/+0+1/+0+1":"model: table.glb"');
    const model = document.renderNodes[0].model!;
    expect(resolveModelVariants(model)).toMatchObject({ source: 'table.standard.glb', previewSource: 'table.preview.glb', detailSource: 'table.detail.glb' });
    expect(model.previewSource).toBeUndefined();
    expect(model.source).toBe('table.glb');
  });
});

it.each(['chair.glb', 'chair.standard.glb', 'chair.preview.glb', 'chair.detail.glb'])(
  'resolves the original of %s', source => {
    expect(originalModelSource('https://models.example/' + source + '?v=1#mesh')).toBe('https://models.example/chair.glb?v=1#mesh');
  },
);
