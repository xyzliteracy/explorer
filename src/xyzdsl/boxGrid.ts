import { parsePathNumber } from './pathParser';
import { parseMaterialDeclaration } from './materialParser';
import type { XyzDslPropertyDeclaration } from './propertyParser';
import type { SurfacePanelSpec } from './types';

export const GRID_PROPERTIES = ['box-grid', 'box-grid-columns', 'box-grid-rows', 'box-grid-slices', 'box-partition', 'cell', 'box-grid-areas'];
export type Triple = [number, number, number];
export interface GridTrack { length?: number; fraction?: number }
export interface BoxGridSpec { counts: Triple; tracks?: [GridTrack[]?, GridTrack[]?, GridTrack[]?]; areas?: string[][][]; partition?: SurfacePanelSpec; invalid?: boolean }
export interface CellSpec { indices?: Triple; name?: string; all?: boolean; invalid?: boolean }
export interface GridRegion { name: string; start: Triple; end: Triple; origin: Triple; size: Triple }
export interface GridLayout { counts: Triple; thickness: number; size: Triple; inset: Triple; cellSize: Triple; tracks?: number[][]; offsets?: number[][]; regions?: GridRegion[]; areas?: string[][][]; meshEdges?: number[][]; meshBlocks?: string[]; meshOrigin?: Triple }

/** Structural declarations are local, but references retain and may override them. */
export function parseGridProperties(declarations: XyzDslPropertyDeclaration[], diagnostics: string[], base?: { boxGrid?: BoxGridSpec | null; cell?: CellSpec | null }) {
  let boxGrid = base?.boxGrid ? { ...base.boxGrid, counts: [...base.boxGrid.counts] as Triple, tracks: base.boxGrid.tracks?.map(a => a?.map(t => ({ ...t }))) as BoxGridSpec['tracks'] } : base?.boxGrid;
  let cell = base?.cell;
  const count = (raw: string) => {
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw Error();
    return Number(raw);
  };
  const name = /^[A-Za-z_][A-Za-z0-9_-]*$/;
  for (const { property, value } of declarations) {
    if (!GRID_PROPERTIES.includes(property)) continue;
    try {
      if (property === 'cell') {
        if (value === 'none') cell = null;
        else if (value === 'all') cell = { all: true };
        else if (name.test(value)) cell = { name: value };
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
        } else if (property === 'box-grid-areas') {
          if (value === 'none') delete boxGrid.areas;
          else {
            const areas = value.split('/').map(slice => slice.split('|').map(row => row.trim().split(/\s+/)));
            if (areas.some(s => s.some(r => r.some(n => n !== '.' && (!name.test(n) || n === 'all' || n === 'none'))))) throw Error();
            boxGrid.areas = areas;
          }
        } else if (property === 'box-grid') {
          const parts = value.trim().split(/\s+/);
          if (parts.length !== 3) throw Error();
          boxGrid.counts = parts.map(count) as Triple;
          delete boxGrid.tracks;
        } else {
          const axis = GRID_PROPERTIES.indexOf(property) - 1;
          const parts = value.trim().split(/\s+/);
          boxGrid.tracks ??= [];
          if (parts.length === 1 && /^[1-9]\d*$/.test(value)) {
            boxGrid.counts[axis] = count(value); boxGrid.tracks[axis] = undefined;
          } else {
            const tracks = parts.map(raw => {
              const fractional = /^(\d+(?:\.\d+)?|\.\d+)fr$/.exec(raw);
              if (fractional) { const fraction = Number(fractional[1]); if (!(fraction > 0) || !Number.isFinite(fraction)) throw Error(); return { fraction }; }
              if (!/^(?:\d+(?:\.\d+)?|\.\d+)[a-z]+$/.test(raw)) throw Error();
              const length = parsePathNumber(raw); if (!(length > 0) || !Number.isFinite(length)) throw Error(); return { length };
            });
            boxGrid.counts[axis] = tracks.length; boxGrid.tracks[axis] = tracks;
          }
        }
      }
    } catch {
      if (property === 'cell') cell = { invalid: true };
      else boxGrid = { ...(boxGrid ?? { counts: [1, 1, 1] }), invalid: true };
      diagnostics.push(property === 'box-partition' ? 'box-partition requires a positive path length and color.' : `${property} has an invalid grid value; use positive counts, positive length/fr tracks, rectangular named areas, or a valid cell selector.`);
    }
  }
  return { boxGrid, cell };
}

export function gridLayout(spec: BoxGridSpec, size: Triple, inset: Triple): GridLayout | undefined {
  const thickness = spec.partition?.thickness ?? 0;
  // Reject excessive counts before allocating any track or topology arrays.
  if (gridCost(spec.counts) > 10000 || spec.counts.some(n => !Number.isSafeInteger(n) || n < 1)) return;
  if (spec.counts.some(n => n > 1) && !spec.partition) return;
  const tracks: number[][] = [], offsets: number[][] = [];
  for (let axis = 0; axis < 3; axis++) {
    const available = size[axis] - (spec.counts[axis] - 1) * thickness;
    const definitions = spec.tracks?.[axis];
    const fixed = definitions?.reduce((sum, t) => sum + (t.length ?? 0), 0) ?? 0;
    const fractions = definitions?.reduce((sum, t) => sum + (t.fraction ?? 0), 0) ?? spec.counts[axis];
    const remaining = available - fixed;
    if (!Number.isFinite(available) || available <= 0 || remaining < -1e-9 || (fractions === 0 && Math.abs(remaining) > 1e-9)) return;
    const lengths = definitions ? definitions.map(t => t.length ?? remaining * t.fraction! / fractions) : Array(spec.counts[axis]).fill(available / spec.counts[axis]);
    if (lengths.some(n => !Number.isFinite(n) || n <= 0)) return;
    let offset = 0; offsets.push(lengths.map(n => { const start = offset; offset += n + thickness; return start; })); tracks.push(lengths);
  }
  const layout: GridLayout = { counts: spec.counts, thickness, size, inset, cellSize: tracks.map(t => t[0]) as Triple, tracks, offsets };
  if (spec.areas) {
    if (spec.areas.length !== spec.counts[2] || spec.areas.some(s => s.length !== spec.counts[1] || s.some(r => r.length !== spec.counts[0]))) return;
    const regions = new Map<string, { start: Triple; end: Triple; count: number }>();
    spec.areas.forEach((slice, z) => slice.forEach((row, y) => row.forEach((name, x) => {
      if (name === '.') return;
      const p: Triple = [x, y, z], r = regions.get(name);
      if (!r) regions.set(name, { start: [...p], end: [...p], count: 1 });
      else { r.count++; p.forEach((n, a) => { r.start[a] = Math.min(r.start[a], n); r.end[a] = Math.max(r.end[a], n); }); }
    })));
    if (!regions.size) return;
    layout.regions = [];
    for (const [name, r] of regions) {
      if (r.count !== r.start.reduce((n, v, a) => n * (r.end[a] - v + 1), 1)) return;
      layout.regions.push({ name, start: r.start, end: r.end, origin: r.start.map((n, a) => offsets[a][n]) as Triple, size: r.start.map((n, a) => offsets[a][r.end[a]] + tracks[a][r.end[a]] - offsets[a][n]) as Triple });
    }
    layout.areas = spec.areas;
  }
  return layout;
}

// Reserve cells and all solid lattice blocks before allocating geometry or copies.
export function gridCost(counts: Triple): number { return counts.reduce((n, c) => n * (2 * c - 1), 1); }

/** Physical lattice for occupied regions, including exterior shell layers. */
export function gridTopology(grid: GridLayout, far: Triple): Record<string, GridLayout> {
  const edges = grid.counts.map((count, a) => {
    const values = [0, grid.inset[a]];
    for (let i = 0; i < count; i++) {
      values.push(grid.inset[a] + grid.offsets![a][i] + grid.tracks![a][i]);
      if (i < count - 1) values.push(grid.inset[a] + grid.offsets![a][i + 1]);
    }
    values.push(grid.inset[a] + grid.size[a] + far[a]); return values;
  });
  const groups: Record<string, string[]> = {};
  const nearNames = ['left', 'bottom', 'front'], farNames = ['right', 'top', 'back'];
  for (let x = 0; x < edges[0].length - 1; x++) for (let y = 0; y < edges[1].length - 1; y++) for (let z = 0; z < edges[2].length - 1; z++) {
    const p = [x, y, z];
    if (p.some((n, a) => edges[a][n + 1] - edges[a][n] <= 1e-12)) continue;
    const outerAxis = p.findIndex((n, a) => n === 0 || n === 2 * grid.counts[a]);
    const adjacent = p.map((n, a) => n % 2 ? [(n - 1) / 2] : [n / 2 - 1, n / 2].filter(i => i >= 0 && i < grid.counts[a]));
    const names = new Set<string>();
    for (const cx of adjacent[0]) for (const cy of adjacent[1]) for (const cz of adjacent[2]) names.add(grid.areas![cz][cy][cx]);
    if (!Array.from(names).some(n => n !== '.')) continue;
    // Interior gaps within one merged region become usable clear space.
    if (outerAxis < 0 && names.size === 1) continue;
    let group = outerAxis < 0 ? 'partition-grid' : p[outerAxis] === 0 ? `surface-${nearNames[outerAxis]}` : `surface-${farNames[outerAxis]}`;
    if (outerAxis < 0 && names.has('.')) {
      // Exposed internal cuts are outside walls, with the corresponding shell face's material and visibility.
      for (let axis = 0; axis < 3; axis++) {
        if (p[axis] % 2) continue;
        const low = p[axis] / 2 - 1, high = low + 1;
        const sideNames = [new Set<string>(), new Set<string>()];
        for (const cx of adjacent[0]) for (const cy of adjacent[1]) for (const cz of adjacent[2]) {
          const q = [cx, cy, cz]; sideNames[q[axis] === low ? 0 : 1].add(grid.areas![cz][cy][cx]);
        }
        if (sideNames[0].size === 1 && sideNames[0].has('.') && !sideNames[1].has('.')) { group = `notch-${nearNames[axis]}-${high}`; break; }
        if (sideNames[1].size === 1 && sideNames[1].has('.') && !sideNames[0].has('.')) { group = `notch-${farNames[axis]}-${high}`; break; }
      }
    }
    (groups[group] ??= []).push(p.join(','));
  }
  return Object.fromEntries(Object.entries(groups).map(([key, meshBlocks]) => {
    const points = meshBlocks.map(b => b.split(',').map(Number));
    const origin = edges.map((e, a) => e[Math.min(...points.map(p => p[a]))]) as Triple;
    const size = edges.map((e, a) => e[Math.max(...points.map(p => p[a])) + 1] - origin[a]) as Triple;
    return [key, { ...grid, size, inset: [0, 0, 0] as Triple, meshOrigin: origin, meshEdges: edges.map((e, a) => e.map(n => n - origin[a])), meshBlocks }];
  }));
}
