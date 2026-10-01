import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { initialQuality, QUALITY, QUALITY_KEY, type RenderQuality } from '../performance/renderQuality';
import type { AssetStatus } from '../performance/ModelAssetStore';
import { ModelRuntime, PERFORMANCE_CANVAS } from '../performance/ModelRuntime';
import { Canvas } from '@react-three/fiber';
import type { SpatialDocument } from '../model/SpatialDocument';
import { dimensionsFromNodes } from '../model/room';
import { XyzCornerGrid } from './XyzCornerGrid';
import { Lighting } from './Lighting';
import { ContentPrimitive } from './ContentPrimitive';
import { CsgPrimitive } from './CsgPrimitive';
import { SpatialPrimitive } from './SpatialPrimitive';
import { ModelPrimitive } from './ModelPrimitive';
import { nodesForRoomSizing } from './roomSizing';
import { cameraClipPlanes, cameraSceneScale } from './cameraScale';
import { ViewPointControls } from './ViewPointControls';
import { ViewPointMarker } from './ViewPointMarker';
import { viewPoints } from './viewPoints';
import type { OrbitControls as OrbitControlType } from 'three-stdlib';
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three';
import { cameraNodeForSelection } from './cameraSelection';
import { CameraClipController } from './CameraClipController';
import { EditorSelectionControls } from './EditorSelectionControls';
import { SelectionBounds } from './SelectionBounds';
import type { AxisName } from '../xyzdsl/types';
import type { LinearStepChoice, RotationStep } from '../ui/SelectedNodeInspector';

interface SceneRootProps {
  document: SpatialDocument;
  selectedNodeId?: string;
  onSelectNode?: (id: string | undefined) => void;
  editorMode: boolean;
  selectedNodeCanEdit: boolean;
  editorLinearStep: number;
  editorRotationStep: RotationStep;
  linearStepChoice: LinearStepChoice;
  onLinearStepChoiceChange: (choice: LinearStepChoice) => void;
  onRotationStepChange: (step: RotationStep) => void;
  onMoveNode: (axis: AxisName, delta: number) => void;
  onResizeNode: (axis: AxisName, delta: number) => void;
  onRotateNode: (axis: AxisName, delta: number) => void;
  onCreateNode: (position: [number, number, number]) => void;
}

const DEFAULT_ORBIT_TARGET: [number, number, number] = [0.6, 0.5, 0.4];
const DEFAULT_CAMERA_POSITION: [number, number, number] = [1.4, 1.1, 1.8];

export function SceneRoot({ document: spatialDocument, selectedNodeId, onSelectNode, editorMode, selectedNodeCanEdit, editorLinearStep, editorRotationStep, linearStepChoice, onLinearStepChoiceChange, onRotationStepChange, onMoveNode, onResizeNode, onRotateNode, onCreateNode }: SceneRootProps) {
  const [quality, setQuality] = useState<RenderQuality>(initialQuality);
  const [assetStatus, setAssetStatus] = useState<AssetStatus>();
  useEffect(() => { try { localStorage.setItem(QUALITY_KEY, quality); } catch { /* Optional persistence. */ } }, [quality]);
  const cameraSizingNodes = useMemo(() => nodesForRoomSizing(spatialDocument), [spatialDocument]);
  const roomDimensions = dimensionsFromNodes(cameraSizingNodes);
  const [modelPrecisionScales, setModelPrecisionScales] = useState<Record<string, number>>({});
  const handleModelPrecisionScaleChange = useCallback((id: string, scale: number | undefined) => {
    setModelPrecisionScales((current) => {
      if (scale === undefined) {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      }
      if (current[id] === scale) return current;
      return { ...current, [id]: scale };
    });
  }, []);
  const selectedNode = useMemo(
    () => {
      const node = cameraNodeForSelection(spatialDocument, selectedNodeId);
      const precisionScale = node && modelPrecisionScales[node.id];
      return node && precisionScale ? {
        ...node,
        metadata: { ...node.metadata, cameraPrecisionScale: precisionScale },
      } : node;
    },
    [modelPrecisionScales, selectedNodeId, spatialDocument],
  );
  const sceneScale = cameraSceneScale(cameraSizingNodes, selectedNode, DEFAULT_CAMERA_POSITION);
  const clips = cameraClipPlanes(sceneScale, cameraSizingNodes, DEFAULT_CAMERA_POSITION);
  const points = useMemo(() => viewPoints(spatialDocument), [spatialDocument]);
  const orbitRef = useRef<OrbitControlType>(null);
  const [tour, setTour] = useState<{ document: SpatialDocument; index: number; orbitTarget?: [number, number, number] }>();
  const pointIndex = tour?.document === spatialDocument && points.length ? tour.index : undefined;
  const point = pointIndex === undefined ? undefined : points[pointIndex];
  const cameraMode = point ? 'pov' : 'orbit';
  const exitTour = useCallback(() => setTour(undefined), []);
  const traverse = useCallback((delta: number) => setTour(current => current && ({ ...current, index: Math.max(0, Math.min(points.length - 1, current.index + delta)) })), [points.length]);
  const orbitTarget = useMemo(() => {
    return selectedNode?.transform.position ?? DEFAULT_ORBIT_TARGET;
  }, [selectedNode]);

  const invalidateRef = useRef<() => void>(() => {});
  const cameraRef = useRef<ThreePerspectiveCamera>(null);

  return (
    <div className="scene-viewport">
    <Canvas
      className="scene-canvas"
      {...PERFORMANCE_CANVAS}
      dpr={[1, QUALITY[quality].dpr]}
      onCreated={({ invalidate }) => { invalidateRef.current = invalidate; }}
      onPointerMissed={() => {
        if (cameraMode === 'orbit') onSelectNode?.(undefined);
      }}
    >
      <ModelRuntime onStatus={import.meta.env.DEV ? setAssetStatus : undefined}>
      <color attach="background" args={['#151820']} />
      <PerspectiveCamera ref={cameraRef} makeDefault position={DEFAULT_CAMERA_POSITION} fov={45} near={clips.near} far={clips.far} />
      <Lighting />
      {editorMode && <XyzCornerGrid {...roomDimensions} />}
      {spatialDocument.csgExpressions.map((expression) => (
        <CsgPrimitive
          key={expression.id}
          expression={expression}
          onSelect={onSelectNode}
          selectionEnabled={cameraMode === 'orbit'}
        />
      ))}
      {spatialDocument.renderNodes.map((node) => (
        node.model?.source ? (
          <ModelPrimitive key={node.id} node={node} selected={node.id === selectedNodeId} maxTier={QUALITY[quality].maxTier} onSelect={onSelectNode} selectionEnabled={cameraMode === 'orbit'} onPrecisionScaleChange={handleModelPrecisionScaleChange} />
        ) : node.content?.kind ? (
          <ContentPrimitive key={node.id} node={node} onSelect={onSelectNode} selectionEnabled={cameraMode === 'orbit'} />
        ) : (
          <SpatialPrimitive key={node.id} node={node} onSelect={onSelectNode} selectionEnabled={cameraMode === 'orbit'} />
        )
      ))}
      {editorMode && !point && points.map(node => (
        <ViewPointMarker key={node.id} node={node} selected={node.id === selectedNodeId} onSelect={onSelectNode} />
      ))}
      {selectedNode && !point && (editorMode || !selectedNode.metadata?.viewPoint) ? <SelectionBounds node={selectedNode} /> : null}
      {cameraMode === 'orbit' ? <OrbitControls ref={orbitRef} makeDefault target={orbitTarget} maxPolarAngle={Math.PI} /> : null}
      <ViewPointControls point={point} orbitTarget={tour?.orbitTarget} onTraverse={traverse} onExit={exitTour} />
      <CameraClipController nodes={cameraSizingNodes} scale={sceneScale} />
      <EditorSelectionControls
        active={editorMode && cameraMode === 'orbit'}
        canEditSelection={Boolean(selectedNodeId && selectedNodeCanEdit)}
        linearStep={editorLinearStep}
        rotationStep={editorRotationStep}
        linearStepChoice={linearStepChoice}
        onLinearStepChoiceChange={onLinearStepChoiceChange}
        onRotationStepChange={onRotationStepChange}
        onMove={onMoveNode}
        onResize={onResizeNode}
        onRotate={onRotateNode}
        onCreate={onCreateNode}
      />
      </ModelRuntime>
    </Canvas>
    <section className={`camera-controls camera-controls--${cameraMode}`} aria-label="Camera navigation">
      <label>Quality <select aria-label="Rendering quality" value={quality} onChange={event => setQuality(event.target.value as RenderQuality)}>
        <option value="low">Low</option><option value="balanced">Balanced</option><option value="high">High</option>
      </select></label>
      {import.meta.env.DEV && assetStatus && <small aria-label="Model resource usage">{assetStatus.ready}/{assetStatus.total} models · {(assetStatus.bytes / 1048576).toFixed(1)} MiB estimated · {assetStatus.loading} loading</small>}
      {point ? <>
        <div role="group" aria-label="View point traversal">
          <button type="button" disabled={pointIndex === 0} onClick={() => traverse(-1)}>Previous</button>
          <span role="status">View point {(pointIndex ?? 0) + 1} / {points.length}</span>
          <button type="button" disabled={pointIndex === points.length - 1} onClick={() => traverse(1)}>Next</button>
          <button type="button" onClick={exitTour}>Exit tour</button>
        </div>
        <p>Drag or swipe to look around · Previous/Next to traverse · ↑/↓ previous/next · Esc exit.</p>
      </> : <>
        {points.length > 0 && <button type="button" onClick={() => setTour({ document: spatialDocument, index: 0, orbitTarget: orbitRef.current?.target.toArray() as [number, number, number] | undefined })}>Start tour · {points.length} view points</button>}
        <p>{editorMode ? 'Ctrl/Cmd + wheel rotate · +/− resize all · X/Y/Z resize axis · Shift decreases · [ step fine/coarse · ] angle fine/coarse · ' : ''}Cmd/Ctrl + click to select</p>
      </>}
    </section>
    </div>
  );
}
