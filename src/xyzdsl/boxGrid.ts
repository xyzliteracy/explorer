import { parsePathNumber } from './pathParser';
import { parseMaterialDeclaration } from './materialParser';
import type { XyzDslPropertyDeclaration } from './propertyParser';
import type { SurfacePanelSpec } from './types';

export const GRID_PROPERTIES = ['box-grid', 'box-grid-columns', 'box-grid-rows', 'box-grid-slices', 'box-partition', 'cell'];
export type Triple = [number, number, number];
export interface BoxGridSpec { counts: Triple; partition?: SurfacePanelSpec; invalid?: boolean }
export interface CellSpec { indices?: Triple; all?: boolean; invalid?: boolean }
export interface GridLayout { counts: Triple; thickness: number; size: Triple; inset: Triple; cellSize: Triple }

/** Structural declarations are local, but references retain and may override them. */
export function parseGridProperties(declarations: XyzDslPropertyDeclaration[], diagnostics: string[], base?: { boxGrid?: BoxGridSpec | null; cell?: CellSpec | null }) {
  let boxGrid = base?.boxGrid ? { ...base.boxGrid, counts: [...base.boxGrid.counts] as Triple } : base?.boxGrid;
  let cell = base?.cell;
  const count = (raw: string) => {
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw Error();
    return Number(raw);
  };
  for (const { property, value } of declarations) {
    if (!GRID_PROPERTIES.includes(property)) continue;
    try {
      if (property === 'cell') {
        if (value === 'none') cell = null;
        else if (value === 'all') cell = { all: true };
        else {
          const parts = value.trim().split(/\s+/);
          if (parts.length !== 3) throw Error();
          cell = { indices: parts.map(count) as Triple };
        }
      } else if (property === 'box-grid' && value === 'none') boxGrid = null;
      else {
        boxGrid ??= { counts: [1, 1, 1] };
        if (property === 'box-partition') {
          const match = /^(\S+)\s+(.+)$/.exec(value);
          if (!match) throw Error();
          const thickness = parsePathNumber(match[1]);
          const material = parseMaterialDeclaration([{ property: 'color', value: match[2], source: value }]);
          if (!(thickness > 0) || !Number.isFinite(thickness) || material.diagnostics.length || material.color === undefined) throw Error();
          boxGrid.partition = { thickness, color: material.color };
        } else if (property === 'box-grid') {
          const parts = value.trim().split(/\s+/);
          if (parts.length !== 3) throw Error();
          boxGrid.counts = parts.map(count) as Triple;
        } else boxGrid.counts[GRID_PROPERTIES.indexOf(property) - 1] = count(value);
      }
    } catch {
      if (property === 'cell') cell = { invalid: true };
      else boxGrid = { ...(boxGrid ?? { counts: [1, 1, 1] }), invalid: true };
      diagnostics.push(property === 'box-partition' ? 'box-partition requires a positive path length and color.' : `${property} requires positive integer counts (${property === 'cell' || property === 'box-grid' ? 'column row slice' : 'one count'}); cell also accepts all or none, and box-grid accepts none.`);
    }
  }
  return { boxGrid, cell };
}

export function gridLayout(spec: BoxGridSpec, size: Triple, inset: Triple): GridLayout | undefined {
  const thickness = spec.partition?.thickness ?? 0;
  if (spec.counts.some(n => n > 1) && !spec.partition) return;
  const cellSize = size.map((extent, i) => (extent - (spec.counts[i] - 1) * thickness) / spec.counts[i]) as Triple;
  if (cellSize.some(n => !Number.isFinite(n) || n <= 0)) return;
  return { counts: spec.counts, thickness, size, inset, cellSize };
}

// Reserve cells and all solid lattice blocks before allocating geometry or copies.
export function gridCost(counts: Triple): number { return counts.reduce((n, c) => n * (2 * c - 1), 1); }
