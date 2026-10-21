import { describe, expect, it } from 'vitest';
import { constrainedRenderer, shadowBudget } from './renderBudget';

describe('bounded point shadow allocations', () => {
  it('keeps all four Pap lights within 64 MiB including depth on mobile', () => {
    expect(shadowBudget(4, true, 16384)).toMatchObject({ count: 4, mapSize: 512, estimatedBytes: 64 * 1024 ** 2 });
  });
  it('scales with scene size and device limits instead of allocating per light indefinitely', () => {
    for (const mobile of [true, false]) for (const lights of [0, 1, 4, 8, 1000]) for (const limit of [256, 1024, 4096, 16384]) {
      const result = shadowBudget(lights, mobile, limit);
      expect(result.estimatedBytes).toBeLessThanOrEqual(result.budgetBytes);
      expect(result.count).toBeLessThanOrEqual(mobile ? 4 : 8);
      if (result.count) expect(result.mapSize * 4).toBeLessThanOrEqual(limit);
    }
  });
  it('retains high desktop resolution when it fits and allocates nothing in recovery mode', () => {
    expect(shadowBudget(1, false, 16384).mapSize).toBe(2048);
    expect(shadowBudget(4, false, 16384).mapSize).toBe(1024);
    expect(shadowBudget(4, true, 16384, true).estimatedBytes).toBe(0);
  });
  it('covers iPad desktop identity, Android, touch and known low-memory desktops', () => {
    expect(constrainedRenderer(undefined, 'iPhone')).toBe(true);
    expect(constrainedRenderer(undefined, '', 'MacIntel', 5)).toBe(true);
    expect(constrainedRenderer(8, 'Android')).toBe(true);
    expect(constrainedRenderer(8, '', '', 0, true)).toBe(true);
    expect(constrainedRenderer(2)).toBe(true);
    expect(constrainedRenderer(undefined, 'Macintosh', 'MacIntel', 0)).toBe(false);
  });
});
