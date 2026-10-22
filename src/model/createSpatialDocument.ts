import { Matrix4 } from 'three';
import { clippedBounds, repeatClipPlanes } from './clipping';
import { parseXyzDslDocument } from '../xyzdsl/parser';
import { resolveXyzDslDocument } from '../xyzdsl/resolveDocument';
import { canonicalNamespacePath } from '../xyzdsl/pathParser';
import type { SpatialDocument } from './SpatialDocument';
import type { SpatialNode } from './SpatialNode';
import { assignUnionGroups, boundsFromTransformedBox } from './collision';
import { buildCsgExpressions } from './csg';
import { geometryFromBox } from './geometry';
import {
  matrixFromTransform,
  anchorTransformFromBox,
  composeTransforms,
  transformFromBox,
} from './transform';

function nearestConcreteAncestor(
  namespace: string[],
  nodesByNamespace: Map<string, SpatialNode>,
): SpatialNode | undefined {
  for (let length = namespace.length - 1; length > 0; length -= 1) {
    const ancestor = nodesByNamespace.get(
      canonicalNamespacePath(namespace.slice(0, length)),
    );

    if (ancestor) {
      return ancestor;
    }
  }

  return undefined;
}

function flattenRenderable(nodes: SpatialNode[]): SpatialNode[] {
  return nodes
    .flatMap((node) => [
      node.renderable ? node : undefined,
      ...flattenRenderable(node.children ?? []),
    ])
    .filter(Boolean) as SpatialNode[];
}

function applyRenderableStateToTree(
  nodes: SpatialNode[],
  renderableNodes: SpatialNode[],
): SpatialNode[] {
  const stateById = new Map(renderableNodes.map((node) => [node.id, node]));

  return nodes.map((node) => {
    const state = stateById.get(node.id);

    return {
      ...node,
      unionGroupId: state?.unionGroupId ?? node.unionGroupId,
      csgExpressionId: state?.csgExpressionId ?? node.csgExpressionId,
      csgConsumed: state?.csgConsumed ?? node.csgConsumed,
      modelCsgOperations: state?.modelCsgOperations,
      children: node.children ? applyRenderableStateToTree(node.children, renderableNodes) : undefined,
    };
  });
}

export function createSpatialDocument(source: string): SpatialDocument {
  const parsed = parseXyzDslDocument(source);
  const resolved = resolveXyzDslDocument(parsed.value ?? []);
  const diagnostics = [...parsed.diagnostics, ...resolved.diagnostics];
  const nodesByNamespace = new Map<string, SpatialNode>();
  const topLevelNodes: SpatialNode[] = [];

  resolved.objects
    .sort(
      (a, b) =>
        a.namespace.length - b.namespace.length || a.lineNumber - b.lineNumber,
    )
    .forEach((object) => {
      const geometry = object.model.source && object.geometry.operation
        ? { ...object.geometry, operation: undefined }
        : object.geometry;
      if (object.model.source && object.geometry.operation) {
        diagnostics.push({
          line: object.lineNumber,
          source: object.source,
          message: 'CSG operations are not supported for imported models.',
        });
      }
      const parent = nearestConcreteAncestor(
        object.namespace,
        nodesByNamespace,
      );
      const hasChildren = resolved.objects.some(
        (candidate) =>
          candidate !== object &&
          candidate.namespace.length > object.namespace.length &&
          object.namespace.every(
            (segment, index) => candidate.namespace[index] === segment,
          ),
      );
      const localTransform = object.renderable || object.viewPoint
        ? transformFromBox(object.box, object.transform)
        : {
            ...anchorTransformFromBox(object.box, object.transform),
            scale: object.anchorScale ?? [1, 1, 1],
          };
      const worldTransform = parent?.worldTransform
        ? composeTransforms(parent.worldTransform, localTransform)
        : localTransform;
      const clippingPlanes = [
        ...(parent?.clippingPlanes ?? []),
        ...repeatClipPlanes(object.repeatClip ?? [], parent?.worldTransform ? matrixFromTransform(parent.worldTransform) : new Matrix4()),
      ];
      const originalBounds = boundsFromTransformedBox(object.box, worldTransform);
      const bounds = clippedBounds(originalBounds, clippingPlanes);
      const unsupportedContent = clippingPlanes.length > 0 && object.content.kind && !object.model.source;
      if (unsupportedContent) diagnostics.push({ line: object.lineNumber, source: object.source,
        message: 'repeat-edge: clip supports primitives and imported models; content cards inside clipped subtrees are omitted.',
      });
      const node: SpatialNode = {
        id: object.id,
        source: object.source,
        box: object.box,
        light: object.renderable ? object.light : undefined,
        material: object.material,
        content: object.content,
        model: object.model.source ? object.model : undefined,
        geometry: geometryFromBox(object.box, geometry),
        localTransform,
        worldTransform,
        transform: worldTransform,
        bounds: bounds ?? originalBounds,
        ...(clippingPlanes.length ? { clippingPlanes } : {}),
        namespacePath: object.namespacePath,
        parentNamespacePath: object.parentNamespacePath,
        renderable: object.renderable && !object.viewPoint && !object.light && Boolean(bounds) && !unsupportedContent,
        children: [],
        metadata: {
          viewPoint: Boolean(object.viewPoint && object.renderable),
          lineNumber: object.lineNumber,
          declarationOnly: object.declarationOnly,
          container: hasChildren,
          reference: object.reference.targetPath,
          materializedFrom: object.materializedFrom,
          anchorScale: object.anchorScale,
          attachedPanelId: object.attachedPanelId,
          attachmentEnclosureId: object.attachmentEnclosureId,
          attachmentFrame: object.attachmentFrame,
          repeatGroupId: object.repeatGroupId,
          surfaceSourceId: object.surfaceSourceId,
          surfaceFace: object.surfaceFace,
          repeatSourceId: object.repeatSourceId,
          repeatIndices: object.repeatIndices,
        },
      };

      if (object.namespacePath && !nodesByNamespace.has(object.namespacePath)) {
        nodesByNamespace.set(object.namespacePath, node);
      }

      if (parent) {
        parent.children = [...(parent.children ?? []), node];
      } else {
        topLevelNodes.push(node);
      }
    });

  const allNodes = [...nodesByNamespace.values()];
  const byId = new Map(allNodes.map(node => [node.id, node]));
  for (const node of allNodes) {
    const panel = byId.get(node.metadata?.attachedPanelId as string);
    if (panel) node.surfaceVisibility = { transform: panel.transform, observable: panel.material.observable };
  }
  const candidates = flattenRenderable(topLevelNodes);
  const groupedNodes = assignUnionGroups(candidates.filter(node => node.renderable));
  const csg = buildCsgExpressions(groupedNodes);
  const renderNodes = csg.nodes.filter((node) => !node.csgConsumed && (!node.csgExpressionId || node.modelCsgOperations));
  const nodes = applyRenderableStateToTree(topLevelNodes, csg.nodes);

  return {
    id: 'spatial-document',
    nodes,
    renderNodes,
    csgExpressions: csg.expressions,
    diagnostics,
  };
}
