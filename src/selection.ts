import type { SpatialNode } from './model/SpatialNode';

function lineNumberForNode(node: SpatialNode | undefined): number | undefined {
  return node?.metadata?.lineNumber as number | undefined;
}

function isDeclarationOnly(node: SpatialNode): boolean {
  return Boolean(node.metadata?.declarationOnly);
}

function isLayoutFrame(node: SpatialNode): boolean {
  return Boolean(node.metadata?.cellFrame || node.metadata?.attachmentFrame);
}

function isEditableContainerAnchor(node: SpatialNode): boolean {
  return !isLayoutFrame(node) && !node.renderable && !isDeclarationOnly(node) && lineNumberForNode(node) !== undefined;
}

function firstRenderableDescendant(node: SpatialNode): SpatialNode | undefined {
  for (const child of node.children ?? []) {
    if (child.renderable && !child.csgConsumed) {
      return child;
    }

    const descendant = firstRenderableDescendant(child);

    if (descendant) {
      return descendant;
    }
  }

  return undefined;
}

function csgBaseForTool(nodes: SpatialNode[], node: SpatialNode): SpatialNode | undefined {
  if (!node.csgConsumed || !node.csgExpressionId) {
    return undefined;
  }

  for (const candidate of nodes) {
    if (candidate.csgExpressionId === node.csgExpressionId && !candidate.csgConsumed) {
      return candidate;
    }

    const child = csgBaseForTool(candidate.children ?? [], node);

    if (child) {
      return child;
    }
  }

  return undefined;
}

export function findNodeById(nodes: SpatialNode[], id?: string): SpatialNode | undefined {
  if (!id) {
    return undefined;
  }

  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }

    const child = findNodeById(node.children ?? [], id);

    if (child) {
      return child;
    }
  }

  return undefined;
}

export function findNodeByLineNumber(nodes: SpatialNode[], lineNumber?: number): SpatialNode | undefined {
  if (lineNumber === undefined) {
    return undefined;
  }

  for (const node of nodes) {
    if (!isLayoutFrame(node) && lineNumberForNode(node) === lineNumber) {
      return node;
    }

    const child = findNodeByLineNumber(node.children ?? [], lineNumber);

    if (child) {
      return child;
    }
  }

  return undefined;
}

export function findNodePathById(nodes: SpatialNode[], id?: string): SpatialNode[] {
  if (!id) {
    return [];
  }

  for (const node of nodes) {
    if (node.id === id) {
      return [node];
    }

    const childPath = findNodePathById(node.children ?? [], id);

    if (childPath.length > 0) {
      return [node, ...childPath];
    }
  }

  return [];
}

export function sceneHighlightIdForNode(nodes: SpatialNode[], node: SpatialNode | undefined): string | undefined {
  if (!node) {
    return undefined;
  }

  if ((node.renderable || node.csgExpressionId) && !node.csgConsumed) {
    return node.id;
  }

  if (isEditableContainerAnchor(node)) {
    return node.id;
  }

  return csgBaseForTool(nodes, node)?.id ?? firstRenderableDescendant(node)?.id;
}

export function selectionTargetForNodeId(nodes: SpatialNode[], id?: string): SpatialNode | undefined {
  const path = findNodePathById(nodes, id);

  if (path.length === 0) {
    return undefined;
  }

  const leaf = path.at(-1);
  if (leaf?.metadata?.surfaceSourceId) return findNodeById(nodes, leaf.metadata.surfaceSourceId as string);
  if (leaf?.metadata?.viewPoint || leaf?.metadata?.attachedPanelId) return leaf;

  // A cell frame is generated layout, not the authored object being edited.
  // Keep selection within that cell's authored subtree rather than promoting
  // it to the enclosure (or exposing the synthetic cell's dimensions).
  const cellFrameIndex = path.map(node => Boolean(node.metadata?.cellFrame)).lastIndexOf(true);
  return path.slice(cellFrameIndex + 1).reverse().find(isEditableContainerAnchor) ?? leaf;
}

export { lineNumberForNode };
