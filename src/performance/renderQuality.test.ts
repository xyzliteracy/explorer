import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultQuality, initialQuality, isRenderQuality } from './renderQuality';
import { requestedModelTier } from './modelVisibility';
afterEach(() => vi.unstubAllGlobals());
describe('quality and selected model residency', () => {
  it('uses conservative capability defaults', () => {
    expect(defaultQuality(undefined, undefined, true)).toBe('low');
    expect(defaultQuality(4, 8)).toBe('low');
    expect(defaultQuality(8, 4)).toBe('low');
    expect(defaultQuality()).toBe('balanced');
    expect(isRenderQuality('ultra')).toBe(false);
  });
  it('uses device limits without consulting a saved viewer override', () => {
    const read = vi.fn(() => 'high');
    vi.stubGlobal('localStorage', { getItem: read });
    vi.stubGlobal('navigator', { hardwareConcurrency: 8, deviceMemory: 8 });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(initialQuality()).toBe('low');
    expect(read).not.toHaveBeenCalled();
  });
  it('pins selected objects outside the frustum without overriding quality', () => {
    expect(requestedModelTier(0, 'none', true)).toBe('detail');
    expect(requestedModelTier(0, 'none', true, 'preview')).toBe('preview');
    expect(requestedModelTier(0, 'detail', false)).toBe('none');
    expect(requestedModelTier(900, 'detail', false, 'standard')).toBe('standard');
  });
});
