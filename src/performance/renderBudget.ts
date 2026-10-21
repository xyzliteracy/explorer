const MiB = 1024 * 1024;
const SAFE_MODE_KEY = 'xyz-render-safe-mode';

/** Hints select a conservative starting budget, never an estimate of free VRAM. */
export function constrainedRenderer(memory?: number, userAgent = '', platform = '', touchPoints = 0, coarse = false) {
  return /iPhone|iPad|iPod|Android/.test(userAgent) || (platform === 'MacIntel' && touchPoints > 1)
    || coarse || (memory !== undefined && memory <= 4);
}
export function mobileRenderBudget() {
  if (typeof navigator === 'undefined') return false;
  return constrainedRenderer((navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    navigator.userAgent, navigator.platform, navigator.maxTouchPoints,
    typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
}
export function readSafeRendering() {
  try { return sessionStorage.getItem(SAFE_MODE_KEY) === '1'; } catch { return false; }
}
export function rememberSafeRendering() {
  try { sessionStorage.setItem(SAFE_MODE_KEY, '1'); } catch { /* Storage may be unavailable. */ }
}

/** r181 point shadows use a 4 x 2 atlas. Reserve RGBA8 + four bytes of depth
 * per pixel, including the two unused tiles. This is an estimate, not VRAM telemetry.
 * Bound pass count as well as memory; additional lights still illuminate the scene.
 */
export function shadowBudget(lightCount: number, constrained: boolean, maxTextureSize: number, safe = false) {
  const budgetBytes = (constrained ? 64 : 256) * MiB;
  let count = safe ? 0 : Math.min(Math.max(0, Math.floor(lightCount)), constrained ? 4 : 8);
  let mapSize = constrained ? 512 : 2048;
  while (mapSize >= 128 && (mapSize * 4 > maxTextureSize || count * 8 * mapSize ** 2 * 8 > budgetBytes)) mapSize /= 2;
  if (mapSize < 128) { count = 0; mapSize = 128; }
  return { count, mapSize, estimatedBytes: count * 8 * mapSize ** 2 * 8, budgetBytes };
}
