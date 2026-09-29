import { describe, expect, it } from 'vitest';
import { defaultQuality, isRenderQuality } from './renderQuality';
import { requestedModelTier } from './modelVisibility';
describe('quality and selected model residency', () => {
  it('uses conservative capability defaults', () => {
    expect(defaultQuality(undefined, undefined, true)).toBe('low');
    expect(defaultQuality(4, 8)).toBe('low');
    expect(defaultQuality(8, 4)).toBe('low');
    expect(defaultQuality()).toBe('balanced');
    expect(isRenderQuality('ultra')).toBe(false);
  });
  it('pins selected objects outside the frustum without overriding quality', () => {
    expect(requestedModelTier(0, 'none', true)).toBe('detail');
    expect(requestedModelTier(0, 'none', true, 'preview')).toBe('preview');
    expect(requestedModelTier(0, 'detail', false)).toBe('none');
    expect(requestedModelTier(900, 'detail', false, 'standard')).toBe('standard');
  });
});
