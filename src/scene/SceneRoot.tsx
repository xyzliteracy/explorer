import { useCallback, useMemo, useRef, useState } from 'react';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { initialQuality, QUALITY } from '../performance/renderQuality';
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
import { useMobileViewport } from '../ui/useMobileViewport';
import { useViewPointTour } from './useViewPointTour';
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
  const [quality] = useState(initialQuality);
  const mobile = useMobileViewport();
  const [assetStatus, setAssetStatus] = useState<AssetStatus>();
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
  const tour = useViewPointTour(spatialDocument, points.length, mobile, editorMode);
  const pointIndex = tour.index;
  const point = pointIndex === undefined ? undefined : points[pointIndex];
  const cameraMode = point ? 'pov' : 'orbit';
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
      <ViewPointControls point={point} orbitTarget={tour.orbitTarget} onTraverse={tour.traverse} onExit={tour.exit} />
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
    {mobile ? point && points.length > 1 && (
      <nav className="view-point-overlays" aria-label="View point traversal">
        <span className="view-point-status" role="status">View point {(pointIndex ?? 0) + 1} of {points.length}</span>
        <button type="button" aria-label="Previous view point" onClick={() => tour.traverse(-1)}>‹</button>
        <button type="button" aria-label="Next view point" onClick={() => tour.traverse(1)}>›</button>
      </nav>
    ) : (
    <section className={`camera-controls camera-controls--${cameraMode}`} aria-label="Camera navigation">
      {import.meta.env.DEV && assetStatus && <small aria-label="Model resource usage">{assetStatus.ready}/{assetStatus.total} models · {(assetStatus.bytes / 1048576).toFixed(1)} MiB estimated · {assetStatus.loading} loading</small>}
      {point ? <>
        <div role="group" aria-label="View point traversal">
          <button type="button" disabled={points.length < 2} onClick={() => tour.traverse(-1)}>Previous</button>
          <span role="status">View point {(pointIndex ?? 0) + 1} / {points.length}</span>
          <button type="button" disabled={points.length < 2} onClick={() => tour.traverse(1)}>Next</button>
          <button type="button" onClick={tour.exit}>Exit tour</button>
        </div>
        <p>Drag to look around · Previous/Next to traverse · ↑/↓ previous/next · Esc exit.</p>
      </> : <>
        {points.length > 0 && <button type="button" onClick={() => tour.start(orbitRef.current?.target.toArray() as [number, number, number] | undefined)}>Start tour · {points.length} view points</button>}
        <p>{editorMode ? 'Ctrl/Cmd + wheel rotate · +/− resize all · X/Y/Z resize axis · Shift decreases · [ step fine/coarse · ] angle fine/coarse · ' : ''}Cmd/Ctrl + click to select</p>
      </>}
    </section>
    )}
    </div>
  );
}
