import { parsePathNumber } from './pathParser';
import type { XyzDslPropertyDeclaration } from './propertyParser';
import type { AxisName, XyzDslRepeatSpec } from './types';

export function parseRepeatDeclaration(
  declarations: XyzDslPropertyDeclaration[], diagnostics: string[],
): XyzDslRepeatSpec | undefined {
  const raw = declarations.filter(d => d.property === 'repeat').at(-1)?.value;
  const gapRaw = declarations.filter(d => d.property === 'repeat-gap').at(-1)?.value;
  const edge = declarations.filter(d => d.property === 'repeat-edge').at(-1)?.value;
  if (raw === undefined && gapRaw === undefined && edge === undefined) return undefined;
  const axes = raw?.split(',').map(axis => axis.trim()) ?? [];
  let invalid = false;
  if (!axes.length || axes.some(axis => !['x', 'y', 'z'].includes(axis)) || new Set(axes).size !== axes.length) {
    diagnostics.push('repeat requires distinct comma-separated axes: x, y, z.');
    invalid = true;
  }
  if (edge !== undefined && edge !== 'whole' && edge !== 'clip') {
    diagnostics.push('repeat-edge must be whole or clip.');
    invalid = true;
  }
  let gap = 0;
  if (gapRaw !== undefined) {
    try { gap = parsePathNumber(gapRaw); }
    catch { diagnostics.push('repeat-gap must be a finite non-negative path length (optional d, c, m unit).'); invalid = true; }
  }
  return { ...(edge === 'whole' || edge === 'clip' ? { edge } : {}), axes: axes as AxisName[], gap, ...(invalid ? { invalid } : {}) };
}
