import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultQuality, initialQuality, isRenderQuality } from './renderQuality';
import { requestedModelTier } from './modelVisibility';
afterEach(() => vi.unstubAllGlobals());
describe('quality and selected model residency', () => {
  it('uses conservative capability defaults', () => {
    expect(defaultQuality(undefined, undefined, true)).toBe('balanced');
    expect(defaultQuality(4, 8)).toBe('balanced');
    expect(defaultQuality(8, 4)).toBe('balanced');
    expect(defaultQuality()).toBe('balanced');
    expect(defaultQuality(2, 8, true)).toBe('balanced');
    expect(defaultQuality(2, 2)).toBe('low');
    expect(defaultQuality(1, 8)).toBe('low');
    expect(defaultQuality(8, 2)).toBe('balanced');
    expect(isRenderQuality('ultra')).toBe(false);
  });
  it('uses device limits without consulting a saved viewer override', () => {
    const read = vi.fn(() => 'high');
    vi.stubGlobal('localStorage', { getItem: read });
    vi.stubGlobal('navigator', { hardwareConcurrency: 8, deviceMemory: 8 });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(initialQuality()).toBe('balanced');
    expect(read).not.toHaveBeenCalled();
  });
  it('uses standard for small visible models and upgrades tour focus within device limits', () => {
    expect(requestedModelTier(30, 'none', false, 'standard')).toBe('standard');
    expect(requestedModelTier(30, 'none', false, 'detail', true)).toBe('detail');
    expect(requestedModelTier(30, 'none', false, 'preview', true)).toBe('preview');
    expect(requestedModelTier(0, 'detail', false, 'detail', true)).toBe('none');
  });
  it('pins selected objects outside the frustum without overriding quality', () => {
    expect(requestedModelTier(0, 'none', true)).toBe('detail');
    expect(requestedModelTier(0, 'none', true, 'preview')).toBe('preview');
    expect(requestedModelTier(0, 'detail', false)).toBe('none');
    expect(requestedModelTier(900, 'detail', false, 'standard')).toBe('standard');
  });
});
