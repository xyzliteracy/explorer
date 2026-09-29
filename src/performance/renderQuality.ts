export type RenderQuality = 'low' | 'balanced' | 'high';
export const QUALITY_KEY = 'xyz-render-quality';
export const QUALITY = {
  low: { dpr: 1, maxTier: 'preview' },
  balanced: { dpr: 1.5, maxTier: 'standard' },
  high: { dpr: 2, maxTier: 'detail' },
} as const;
export function isRenderQuality(value: unknown): value is RenderQuality {
  return value === 'low' || value === 'balanced' || value === 'high';
}
export function defaultQuality(memory?: number, cores?: number, coarse = false): RenderQuality {
  return coarse || (memory !== undefined && memory <= 4) || (cores !== undefined && cores <= 4) ? 'low' : 'balanced';
}
export function initialQuality(): RenderQuality {
  try { const saved = localStorage.getItem(QUALITY_KEY); if (isRenderQuality(saved)) return saved; } catch { /* Storage can be disabled. */ }
  if (typeof navigator === 'undefined') return 'balanced';
  return defaultQuality((navigator as Navigator & { deviceMemory?: number }).deviceMemory, navigator.hardwareConcurrency, typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
}
