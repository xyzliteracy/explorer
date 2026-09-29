import { describe, expect, it } from 'vitest';
import { resolveModelUrl } from './resolveModelUrl';

describe('resolveModelUrl', () => {
  it('resolves explicitly based paths and preserves absolute remote URLs', () => {
    expect(resolveModelUrl('chairs/modern.glb', 'https://models.example/assets/')).toBe('https://models.example/assets/chairs/modern.glb');
    expect(resolveModelUrl('https://cdn.example/chair.glb?version=2')).toBe('https://cdn.example/chair.glb?version=2');
  });
  it('requires an explicit base for relative models', () => { expect(() => resolveModelUrl('glb_models/chair.glb')).toThrow('opened scene file'); });
  it.each(['../secret.glb', '..\\secret.glb', 'https://[invalid]/chair.glb', 'data:model/gltf-binary,x', '//evil.example/chair.glb', 'chair.gltf'])('rejects unsafe or unsupported source %s', (source) => {
    expect(() => resolveModelUrl(source, 'https://models.example/assets/')).toThrow();
  });
});
