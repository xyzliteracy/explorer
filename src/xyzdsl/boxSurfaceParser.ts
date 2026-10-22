import { parsePathNumber } from './pathParser';
import { parseMaterialDeclaration } from './materialParser';
import type { XyzDslPropertyDeclaration } from './propertyParser';
import type { XyzDslBoxSurfaceSpec } from './types';

export function parseBoxSurfaceDeclaration(declarations: XyzDslPropertyDeclaration[], diagnostics: string[]): XyzDslBoxSurfaceSpec | null | undefined {
  const raw = declarations.filter(d => d.property === 'box-surface').at(-1)?.value;
  if (raw === undefined) return undefined;
  if (raw === 'none') return null;
  const match = /^(\S+)\s+(.+)$/.exec(raw);
  try {
    if (!match) throw new Error();
    const thickness = parsePathNumber(match[1]);
    if (thickness <= 0) throw new Error();
    const material = parseMaterialDeclaration([{ property: 'color', value: match[2], source: raw }]);
    return { thickness, color: material.color! };
  } catch {
    diagnostics.push('box-surface requires a positive finite path length and a color, or none.');
    return { thickness: 0, color: 'white', invalid: true };
  }
}
