import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { GridLayout } from '../xyzdsl/boxGrid';

/** Boundary of the union of all divider slabs; adjacent solid blocks emit no internal faces. */
export function partitionGridGeometry(grid: GridLayout): BufferGeometry {
  const edges = grid.meshEdges ? grid.meshEdges.map((e, a) => e.map(n => n / grid.size[a] - .5)) : grid.counts.map((count, axis) => {
    const result = [0];
    for (let i = 0; i < count; i++) {
      result.push((grid.offsets?.[axis][i] ?? i * (grid.cellSize[axis] + grid.thickness)) + (grid.tracks?.[axis][i] ?? grid.cellSize[axis]));
      if (i < count - 1) result.push(grid.offsets?.[axis][i + 1] ?? (i + 1) * (grid.cellSize[axis] + grid.thickness));
    }
    result[result.length - 1] = grid.size[axis];
    return result.map(n => n / grid.size[axis] - .5);
  });
  const lengths = edges.map(e => e.length - 1);
  const blocks = grid.meshBlocks ? new Set(grid.meshBlocks) : undefined;
  const occupied = (p: number[]) => p.every((n, i) => n >= 0 && n < lengths[i]) && (blocks ? blocks.has(p.join(',')) : p.some(n => n % 2 === 1));
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let x = 0; x < lengths[0]; x++) for (let y = 0; y < lengths[1]; y++) for (let z = 0; z < lengths[2]; z++) {
    const p = [x, y, z];
    if (!occupied(p)) continue;
    for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
      const neighbor = [...p]; neighbor[axis] += sign;
      if (occupied(neighbor)) continue;
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      const start = positions.length / 3;
      for (const [du, dv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const vertex = [0, 0, 0], normal = [0, 0, 0];
        vertex[axis] = edges[axis][p[axis] + (sign > 0 ? 1 : 0)];
        vertex[u] = edges[u][p[u] + du]; vertex[v] = edges[v][p[v] + dv]; normal[axis] = sign;
        positions.push(...vertex); normals.push(...normal); uvs.push(du, dv);
      }
      indices.push(...(sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map(n => start + n));
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
