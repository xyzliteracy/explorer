import type { XyzDslBoxSpec } from '../xyzdsl/types';
import type { SpatialBounds, SpatialNode } from './SpatialNode';
import type { SpatialTransform } from './transform';
import { transformFromBox } from './transform';

export function boundsFromBox(box: XyzDslBoxSpec): SpatialBounds {
  return boundsFromTransformedBox(box, transformFromBox(box, { rotation: [0, 0, 0], diagnostics: [] }));
}

export function boundsFromTransformedBox(box: XyzDslBoxSpec, transform: SpatialTransform): SpatialBounds {
  const [width, height, depth] = transform.scale;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const halfDepth = depth / 2;
  const corners: [number, number, number][] = [
    [-halfWidth, -halfHeight, -halfDepth],
    [-halfWidth, -halfHeight, halfDepth],
    [-halfWidth, halfHeight, -halfDepth],
    [-halfWidth, halfHeight, halfDepth],
    [halfWidth, -halfHeight, -halfDepth],
    [halfWidth, -halfHeight, halfDepth],
    [halfWidth, halfHeight, -halfDepth],
    [halfWidth, halfHeight, halfDepth],
  ];

  const worldCorners = corners.map((corner) => applyTransform(corner, transform));
  const xs = worldCorners.map(([x]) => x);
  const ys = worldCorners.map(([, y]) => y);
  const zs = worldCorners.map(([, , z]) => z);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function applyTransform([x, y, z]: [number, number, number], transform: SpatialTransform): [number, number, number] {
  const [rotationX, rotationY, rotationZ] = transform.rotation;
  const [pivotX, pivotY, pivotZ] = transform.pivot;
  const [positionX, positionY, positionZ] = transform.position;

  let transformedX = x - pivotX;
  let transformedY = y - pivotY;
  let transformedZ = z - pivotZ;

  const cosX = Math.cos(rotationX);
  const sinX = Math.sin(rotationX);
  const afterX: [number, number, number] = [
    transformedX,
    transformedY * cosX - transformedZ * sinX,
    transformedY * sinX + transformedZ * cosX,
  ];

  const cosY = Math.cos(rotationY);
  const sinY = Math.sin(rotationY);
  const afterY: [number, number, number] = [
    afterX[0] * cosY + afterX[2] * sinY,
    afterX[1],
    -afterX[0] * sinY + afterX[2] * cosY,
  ];

  const cosZ = Math.cos(rotationZ);
  const sinZ = Math.sin(rotationZ);
  [transformedX, transformedY, transformedZ] = [
    afterY[0] * cosZ - afterY[1] * sinZ,
    afterY[0] * sinZ + afterY[1] * cosZ,
    afterY[2],
  ];

  return [transformedX + pivotX + positionX, transformedY + pivotY + positionY, transformedZ + pivotZ + positionZ];
}

export function boundsOverlap(a: SpatialBounds, b: SpatialBounds): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}

export function assignUnionGroups(nodes: SpatialNode[]): SpatialNode[] {
  const adjacency = new Map<string, Set<string>>();

  nodes.forEach((node) => adjacency.set(node.id, new Set()));

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (boundsOverlap(nodes[i].bounds, nodes[j].bounds)) {
        adjacency.get(nodes[i].id)?.add(nodes[j].id);
        adjacency.get(nodes[j].id)?.add(nodes[i].id);
      }
    }
  }

  const visited = new Set<string>();
  const groupByNode = new Map<string, string>();
  let groupNumber = 1;

  nodes.forEach((node) => {
    if (visited.has(node.id)) {
      return;
    }

    const stack = [node.id];
    const component: string[] = [];

    while (stack.length > 0) {
      const current = stack.pop()!;

      if (visited.has(current)) {
        continue;
      }

      visited.add(current);
      component.push(current);
      adjacency.get(current)?.forEach((neighbor) => stack.push(neighbor));
    }

    if (component.length > 1) {
      const groupId = `union-${groupNumber}`;
      groupNumber += 1;
      component.forEach((id) => groupByNode.set(id, groupId));
    }
  });

  return nodes.map((node) => ({ ...node, unionGroupId: groupByNode.get(node.id) }));
}
