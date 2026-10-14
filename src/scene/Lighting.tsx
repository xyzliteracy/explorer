import { useMemo } from 'react';
import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import { nodesForRoomSizing } from './roomSizing';
import { sceneBoundsFromNodes } from './cameraScale';

export function lightNodes(document: SpatialDocument): SpatialNode[] {
  const flatten = (nodes: SpatialNode[]): SpatialNode[] => nodes.flatMap(node => [node, ...flatten(node.children ?? [])]);
  return flatten(document.nodes).filter(node => node.light !== undefined);
}

/** Scene bounds size the shadow cameras of explicitly declared point lights. */
export function lightingBounds(document?: SpatialDocument) {
  const bounds = document && sceneBoundsFromNodes(nodesForRoomSizing(document));
  const center: [number, number, number] = bounds ? [
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  ] : [0.5, 0.5, 0.5];
  const radius = bounds ? Math.max(0.001, Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ) / 2 * 1.05) : 1;
  return { center, radius };
}

/** Point-shadow depth is linear radial distance; keep offsets in scene units.
 * Bound offsets by the smallest declared solid dimension to limit light leaks.
 */
export function pointShadowSettings(document: SpatialDocument | undefined, position: readonly number[]) {
  const { center, radius } = lightingBounds(document);
  const near = Math.min(0.001, radius * 0.001);
  const far = Math.max(radius + Math.hypot(...position.map((value, axis) => value - center[axis])), near * 2);
  const dimensions = document ? nodesForRoomSizing(document).flatMap(node =>
    node.transform.scale.map(Math.abs).filter(size => Number.isFinite(size) && size > 0)) : [];
  const thickness = dimensions.length ? Math.min(...dimensions) : radius;
  const offset = Math.min(0.002, radius * 0.0004, thickness * 0.2);
  return { near, far, bias: -offset / (far - near), normalBias: offset };
}

function ScenePointLight({ node, document }: { node: SpatialNode; document?: SpatialDocument }) {
  const shadow = pointShadowSettings(document, node.transform.position);
  return <pointLight castShadow
    position={node.transform.position} color={node.light!.color}
    intensity={node.light!.intensity} distance={node.light!.distance} decay={2}
    shadow-mapSize={[2048, 2048]} shadow-bias={shadow.bias} shadow-normalBias={shadow.normalBias}
    shadow-camera-near={shadow.near} shadow-camera-far={shadow.far}
  />;
}

export function Lighting({ document }: { document?: SpatialDocument }) {
  const sources = useMemo(() => document ? lightNodes(document) : [], [document]);
  return <>
    <ambientLight color="#ffffff" intensity={0.12} />
    {sources.map(node => <ScenePointLight key={node.id} node={node} document={document} />)}
  </>;
}
