import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL_ASSET_BASE, resolveModelUrl } from './resolveModelUrl';

describe('resolveModelUrl', () => {
  it('resolves explicitly based paths and preserves absolute remote URLs', () => {
    expect(resolveModelUrl('chairs/modern.glb', 'https://models.example/assets/')).toBe('https://models.example/assets/chairs/modern.glb');
    expect(resolveModelUrl('https://cdn.example/chair.glb?version=2')).toBe('https://cdn.example/chair.glb?version=2');
  });
  it('resolves relative models and variants against the default runtime store', () => {
    for (const file of ['side_shelves.glb', 'side_shelves.standard.glb', 'side_shelves.preview.glb', 'side_shelves.detail.glb', 'furniture/chair.glb?v=2#mesh']) {
      expect(resolveModelUrl(file)).toBe(DEFAULT_MODEL_ASSET_BASE + file);
    }
  });
  it.each(['../secret.glb', '%2e%2e/secret.glb', '/chair.glb', '//evil.example/chair.glb'])(
    'rejects paths outside the default store: %s', source => {
      expect(() => resolveModelUrl(source)).toThrow();
    },
  );
  it.each(['../secret.glb', '..\\secret.glb', 'https://[invalid]/chair.glb', 'data:model/gltf-binary,x', '//evil.example/chair.glb', 'chair.gltf'])('rejects unsafe or unsupported source %s', (source) => {
    expect(() => resolveModelUrl(source, 'https://models.example/assets/')).toThrow();
  });
});
