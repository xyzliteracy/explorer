import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { mobileRenderBudget, shadowBudget } from '../performance/renderBudget';
import { useSafeRendering } from '../performance/ModelRuntime';
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

function ScenePointLight({ node, document, mapSize, castShadow }: { node: SpatialNode; document?: SpatialDocument; mapSize: number; castShadow: boolean }) {
  const shadow = pointShadowSettings(document, node.transform.position);
  return <pointLight castShadow={castShadow}
    position={node.transform.position} color={node.light!.color}
    intensity={node.light!.intensity} distance={node.light!.distance} decay={2}
    shadow-mapSize={[mapSize, mapSize]} shadow-bias={shadow.bias} shadow-normalBias={shadow.normalBias}
    // Point-light PCF uses the same nine taps at either radius. Widen the
    // filter for small atlases to soften stair steps without allocating more VRAM.
    shadow-radius={mapSize <= 512 ? 2 : 1}
    shadow-camera-near={shadow.near} shadow-camera-far={shadow.far}
  />;
}

export function Lighting({ document }: { document?: SpatialDocument }) {
  const sources = useMemo(() => document ? lightNodes(document) : [], [document]);
  const { gl } = useThree();
  const safe = useSafeRendering();
  const constrained = useMemo(mobileRenderBudget, []);
  const budget = shadowBudget(sources.length, constrained, gl.capabilities.maxTextureSize, safe);
  useEffect(() => {
    gl.domElement.dataset.renderBudget = JSON.stringify({ ...budget, constrained, safe });
    return () => { delete gl.domElement.dataset.renderBudget; };
  }, [gl, budget.count, budget.mapSize, budget.estimatedBytes, budget.budgetBytes, constrained, safe]);
  return <>
    <ambientLight color="#ffffff" intensity={0.12} />
    {sources.map((node, index) => <ScenePointLight key={`${node.id}:${budget.mapSize}:${index < budget.count}`} node={node} document={document} mapSize={budget.mapSize} castShadow={index < budget.count} />)}
  </>;
}
