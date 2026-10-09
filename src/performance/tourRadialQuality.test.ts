import { expect, it } from 'vitest';
import { requestedTourModelTier } from './modelVisibility';

it.each([false, true])('uses radial rings independently of visible model size (underpowered: %s)', underpowered => {
  for (const pixels of [30, 900]) {
    expect(requestedTourModelTier(pixels, 'none', true, false, underpowered)).toBe(underpowered ? 'standard' : 'detail');
    expect(requestedTourModelTier(pixels, 'none', false, false, underpowered)).toBe(underpowered ? 'preview' : 'standard');
    expect(requestedTourModelTier(pixels, 'none', true, true, underpowered)).toBe('detail');
    expect(requestedTourModelTier(pixels, 'none', false, true, underpowered)).toBe(underpowered ? 'standard' : 'detail');
  }
});

it.each([false, true])('keeps offscreen and tiny models out of the rings (underpowered: %s)', underpowered => {
  expect(requestedTourModelTier(0, 'detail', true, true, underpowered)).toBe('none');
  expect(requestedTourModelTier(11, 'none', false, true, underpowered)).toBe('none');
  expect(requestedTourModelTier(8, 'standard', false, false, underpowered)).toBe(underpowered ? 'preview' : 'standard');
  expect(requestedTourModelTier(5, 'standard', false, false, underpowered)).toBe('none');
});
