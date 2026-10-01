import { useMemo, useState } from 'react';
import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';

interface XyzDslTreeViewProps {
  document: SpatialDocument;
  selectedNodeId?: string;
  onSelectNode?: (id: string) => void;
}

function displayName(node: SpatialNode): string {
  if (node.namespacePath) {
    return node.namespacePath.replace(/\/$/, '');
  }

  return node.id;
}

function metadataValue<T>(node: SpatialNode, key: string): T | undefined {
  return node.metadata?.[key] as T | undefined;
}

function sortedTreeIds(nodes: SpatialNode[]): string[] {
  return nodes.flatMap((node) => [node.id, ...sortedTreeIds(node.children ?? [])]);
}

function hasNestedNodes(nodes: SpatialNode[]): boolean {
  return nodes.some((node) => (node.children?.length ?? 0) > 0 || hasNestedNodes(node.children ?? []));
}

function rotationDegrees(node: SpatialNode): string {
  return node.transform.rotation.map((radian) => Math.round((radian * 180) / Math.PI)).join(', ');
}

function geometryLabel(node: SpatialNode): string {
  const parts: string[] = [node.geometry.kind];

  if (node.geometry.operation) {
    parts.push(`operation ${node.geometry.operation}`);
  }

  if (node.geometry['box-radius'] !== undefined) {
    parts.push(`box-radius ${node.geometry['box-radius']}`);
  }

  return parts.join(' · ');
}

function TreeItem({
  node,
  collapsedIds,
  selectedNodeId,
  onSelectNode,
  onToggle,
}: {
  node: SpatialNode;
  collapsedIds: Set<string>;
  selectedNodeId?: string;
  onSelectNode?: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const children = node.children ?? [];
  const hasChildren = children.length > 0;
  const isCollapsed = collapsedIds.has(node.id);
  const isSelected = selectedNodeId === node.id;
  const lineNumber = metadataValue<number>(node, 'lineNumber');
  const reference = metadataValue<string>(node, 'reference');
  const csgLabel = node.csgExpressionId ? (node.csgConsumed ? `boolean tool ${node.csgExpressionId}` : node.csgExpressionId) : undefined;

  return (
    <li className="xyzdsl-tree-item">
      <div className={`xyzdsl-tree-row${isSelected ? ' is-selected' : ''}`}>
        {hasChildren ? (
          <button
            aria-expanded={!isCollapsed}
            aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${displayName(node)}`}
            className="xyzdsl-tree-toggle"
            type="button"
            onClick={() => onToggle(node.id)}
          >
            {isCollapsed ? '▸' : '▾'}
          </button>
        ) : (
          <span className="xyzdsl-tree-spacer" aria-hidden="true" />
        )}

        <button
          className="xyzdsl-tree-node-summary"
          type="button"
          aria-current={isSelected ? 'true' : undefined}
          onClick={() => onSelectNode?.(node.id)}
        >
          <strong>{displayName(node)}</strong>
          <span>
            {node.metadata?.viewPoint ? 'view point' : node.renderable ? node.geometry.kind : 'group'} · {node.box.width} × {node.box.height} × {node.box.depth} at ({node.box.x},{' '}
            {node.box.y}, {node.box.z})
          </span>
          {node.renderable ? (
            <span className="xyzdsl-tree-object-details">
              {geometryLabel(node)} bounding box: {node.box.width} × {node.box.height} × {node.box.depth} at ({node.box.x}, {node.box.y},{' '}
              {node.box.z}); rotation: {rotationDegrees(node)}°
            </span>
          ) : null}
        </button>

        <div className="xyzdsl-tree-badges" aria-label="Spatial node metadata">
          {lineNumber ? <em>line {lineNumber}</em> : null}
          {node.renderable || node.metadata?.viewPoint ? null : <em>container</em>}
          {reference ? <em>ref {reference}</em> : null}
          {node.geometry.operation ? <em>operation {node.geometry.operation}</em> : null}
          {node.unionGroupId ? <em>{node.unionGroupId}</em> : null}
          {csgLabel ? <em>{csgLabel}</em> : null}
        </div>
      </div>

      {hasChildren && !isCollapsed ? (
        <ul className="xyzdsl-tree-children">
          {children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              collapsedIds={collapsedIds}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function XyzDslTreeView({ document, selectedNodeId, onSelectNode }: XyzDslTreeViewProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const nodeIds = useMemo(() => sortedTreeIds(document.nodes), [document.nodes]);
  const hasCollapsibleNodes = useMemo(() => hasNestedNodes(document.nodes), [document.nodes]);

  function toggleNode(id: string) {
    setCollapsedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function expandAll() {
    setCollapsedIds(new Set());
  }

  function collapseAll() {
    setCollapsedIds(new Set(nodeIds));
  }

  return (
    <section className="xyzdsl-tree-view" aria-label="Spatial declaration tree">
      <div className="section-heading-row">
        <h2>Definition tree</h2>
        {hasCollapsibleNodes ? (
          <div className="tree-actions" aria-label="Tree display controls">
            <button type="button" onClick={expandAll}>
              Expand all
            </button>
            <button type="button" onClick={collapseAll}>
              Collapse all
            </button>
          </div>
        ) : null}
      </div>

      {document.nodes.length === 0 ? (
        <p>No valid definitions yet.</p>
      ) : (
        <>
          {document.csgExpressions.length > 0 ? (
            <div className="xyzdsl-csg-summary" aria-label="Boolean composition summary">
              <h3>Boolean composition expressions</h3>
              <ul>
                {document.csgExpressions.map((expression) => (
                  <li key={expression.id}>
                    <strong>{expression.id}</strong>
                    <span>
                      {expression.base.geometry.kind} with {expression.operations.length} boolean operation
                      {expression.operations.length === 1 ? '' : 's'}:{' '}
                      {expression.operations.map((operation) => `${operation.op} ${operation.tool.geometry.kind}`).join(', ')}
                    </span>
                    <em>{expression.base.id}</em>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <ul className="xyzdsl-tree-root">
            {document.nodes.map((node) => (
              <TreeItem
                key={node.id}
                node={node}
                collapsedIds={collapsedIds}
                selectedNodeId={selectedNodeId}
                onSelectNode={onSelectNode}
                onToggle={toggleNode}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
