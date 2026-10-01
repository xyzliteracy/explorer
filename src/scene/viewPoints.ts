import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';

export function viewPoints(document: SpatialDocument): SpatialNode[] {
  const flatten = (nodes: SpatialNode[]): SpatialNode[] => nodes.flatMap(node => [node, ...flatten(node.children ?? [])]);
  return flatten(document.nodes).filter(node => node.metadata?.viewPoint === true)
    .sort((a, b) => Number(a.metadata?.lineNumber) - Number(b.metadata?.lineNumber));
}

export function swipeTraversal(dx: number, dy: number): number {
  return Math.abs(dy) >= 60 && Math.abs(dy) > Math.abs(dx) * 1.5 ? (dy < 0 ? 1 : -1) : 0;
}
