import { useThree } from '@react-three/fiber';
import { TourModelFocus } from '../performance/TourModelFocus';
import { Fragment, useLayoutEffect, type ReactNode } from 'react';
import type { SpatialDocument } from '../model/SpatialDocument';
import type { SpatialNode } from '../model/SpatialNode';
import type { ModelTier } from '../performance/modelVisibility';
import { CsgPrimitive } from './CsgPrimitive';
import { ModelPrimitive } from './ModelPrimitive';
import { ContentPrimitive } from './ContentPrimitive';
import { SpatialPrimitive } from './SpatialPrimitive';

/** Shared dispatch for every XYZDSL render node. Hosts supply platform adapters. */
export function SpatialScene({ document, selectedNodeId, onSelectNode, selectionEnabled = true, maxTier = 'detail', tourMode = false, resolvedModels = false, renderContent, onPrecisionScaleChange }: {
 document: SpatialDocument; selectedNodeId?: string; onSelectNode?: (id: string) => void;
 tourMode?: boolean; selectionEnabled?: boolean; maxTier?: ModelTier; resolvedModels?: boolean;
 renderContent?: (node: SpatialNode) => ReactNode;
 onPrecisionScaleChange?: (id: string, scale: number | undefined) => void;
}) {
 const gl = useThree(state => state.gl);
 useLayoutEffect(() => { gl.localClippingEnabled = true; }, [gl]);
 const scene = <>
 {document.csgExpressions.map(expression => <CsgPrimitive key={expression.id} expression={expression} onSelect={onSelectNode} selectionEnabled={selectionEnabled}/>)}
 {document.renderNodes.map(node => node.model?.source ?
  <ModelPrimitive key={node.id} node={node} selected={node.id === selectedNodeId} maxTier={maxTier} tourMode={tourMode} onSelect={onSelectNode} selectionEnabled={selectionEnabled} resolved={resolvedModels} onPrecisionScaleChange={onPrecisionScaleChange}/> : node.content?.kind ?
  renderContent ? <Fragment key={node.id}>{renderContent(node)}</Fragment> : <ContentPrimitive key={node.id} node={node} onSelect={onSelectNode} selectionEnabled={selectionEnabled}/> :
  <SpatialPrimitive key={node.id} node={node} onSelect={onSelectNode} selectionEnabled={selectionEnabled}/>)}</>;
 return tourMode ? <TourModelFocus>{scene}</TourModelFocus> : scene;
}
