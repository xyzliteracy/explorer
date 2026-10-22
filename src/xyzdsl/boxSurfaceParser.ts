import { parsePathNumber } from './pathParser';
import { parseMaterialDeclaration } from './materialParser';
import type { XyzDslPropertyDeclaration } from './propertyParser';
import type { SurfaceFace, XyzDslBoxSurfaceSpec, XyzDslObservable } from './types';

export const SURFACE_FACES: SurfaceFace[] = ['top', 'right', 'bottom', 'left', 'front', 'back'];
export const SURFACE_DIRECTIONS: Record<SurfaceFace, XyzDslObservable> = {
  top: '+y', right: '+x', bottom: '-y', left: '-x', front: '-z', back: '+z',
};
export const SURFACE_PROPERTIES = SURFACE_FACES.flatMap(face => [`box-surface-${face}`, `observable-${face}`]);

// Commas inside CSS color functions are not shorthand separators.
function values(raw: string): string[] {
  const parts: string[] = []; let depth = 0; let start = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '(') depth++;
    if (raw[i] === ')') depth--;
    if (depth < 0) throw new Error();
    if (raw[i] === ',' && depth === 0) { parts.push(raw.slice(start, i).trim()); start = i + 1; }
  }
  if (depth) throw new Error();
  parts.push(raw.slice(start).trim());
  if (parts.some(value => !value)) throw new Error();
  return parts;
}
function expand<T>(items: T[]): T[] {
  if (items.length === 1) return Array(6).fill(items[0]);
  if (items.length === 2) return [items[0], items[1], items[0], items[1], items[1], items[1]];
  if (items.length === 3) return [items[0], items[1], items[0], items[1], items[2], items[2]];
  if (items.length === 6) return items;
  throw new Error();
}
export function parseBoxSurfaceDeclaration(
  declarations: XyzDslPropertyDeclaration[], diagnostics: string[], base?: XyzDslBoxSurfaceSpec | null,
): XyzDslBoxSurfaceSpec | null | undefined {
  if (base === undefined && !declarations.some(d => d.property === 'box-surface' || SURFACE_PROPERTIES.includes(d.property) || (d.property === 'observable' && d.value.includes(',')))) return undefined;
  let active = Boolean(base);
  const faces = Object.fromEntries(SURFACE_FACES.map(face => [face, base?.faces[face] ?? null])) as XyzDslBoxSurfaceSpec['faces'];
  const observable = { ...base?.observable };
  let invalid = base?.invalid ?? false;
  let mentioned = base !== undefined;
  for (const declaration of declarations) {
    const { property, value } = declaration;
    const surface = property === 'box-surface' || property.startsWith('box-surface-');
    const visibility = property === 'observable' || property.startsWith('observable-');
    if (!surface && !visibility) continue;
    const shorthand = property === 'box-surface' || property === 'observable';
    const face = property.slice(surface ? 12 : 11) as SurfaceFace;
    if (!shorthand && !SURFACE_FACES.includes(face)) continue;
    try {
      const items = values(value);
      if (!shorthand && items.length !== 1) throw new Error();
      const targets = shorthand ? SURFACE_FACES : [face];
      const expanded = shorthand ? expand(items) : items;
      targets.forEach((target, index) => {
        const raw = expanded[index];
        if (surface) {
          mentioned = true;
          if (raw === 'none') faces[target] = null;
          else {
            const match = /^(\S+)\s+(.+)$/.exec(raw);
            if (!match) throw new Error();
            const thickness = parsePathNumber(match[1]);
            if (thickness <= 0) throw new Error();
            const material = parseMaterialDeclaration([{ ...declaration, property: 'color', value: match[2] }]);
            faces[target] = { thickness, color: material.color! };
          }
        } else {
          if (raw !== 'true' && raw !== 'false' && !['+x','-x','+y','-y','+z','-z'].includes(raw)) throw new Error();
          observable[target] = raw === 'true' ? true : raw === 'false' ? false : raw as XyzDslObservable;
        }
      });
      if (surface && shorthand) active = value !== 'none';
    } catch {
      invalid = true;
      diagnostics.push(`${property} requires ${surface ? 'positive path lengths with colors, or none' : 'true, false, or signed axes'}; shorthands accept 1, 2, 3, or 6 comma-separated values.`);
    }
  }
  if (!active && declarations.some(d => SURFACE_PROPERTIES.includes(d.property))) {
    invalid = true;
    diagnostics.push('Face-specific properties require a box-surface enclosure.');
  }
  if (!active && declarations.some(d => d.property === 'observable' && d.value.includes(','))) {
    invalid = true;
    diagnostics.push('Multi-face observable values require a box-surface enclosure.');
  }
  if (invalid) return { faces, observable, invalid: true };
  return active ? { faces, observable } : mentioned ? null : undefined;
}
