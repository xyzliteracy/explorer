import { useCallback, useMemo, useRef, useState } from 'react';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { initialQuality, QUALITY } from '../performance/renderQuality';
import type { AssetStatus } from '../performance/ModelAssetStore';
import { RendererBoundary } from './RendererBoundary';
import { readSafeRendering, rememberSafeRendering } from '../performance/renderBudget';
import type { PreparationStatus } from '../performance/ModelRuntime';
import { ModelRuntime, PERFORMANCE_CANVAS } from '../performance/ModelRuntime';
import { Canvas } from '@react-three/fiber';
import type { SpatialDocument } from '../model/SpatialDocument';
import { dimensionsFromNodes } from '../model/room';
import { XyzCornerGrid } from './XyzCornerGrid';
import { Lighting, lightNodes } from './Lighting';
import { LightSourceMarker } from './LightSourceMarker';
import { SpatialScene } from './SpatialScene';
import { nodesForRoomSizing } from './roomSizing';
import { cameraClipPlanes, cameraSceneScale } from './cameraScale';
import { ViewPointControls } from './ViewPointControls';
import { ViewPointMarker } from './ViewPointMarker';
import { useMobileViewport } from '../ui/useMobileViewport';
import { useViewPointTour } from './useViewPointTour';
import { viewPoints } from './viewPoints';
import type { OrbitControls as OrbitControlType } from 'three-stdlib';
import type { PerspectiveCamera as ThreePerspectiveCamera, WebGLRenderer } from 'three';
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
  const [safe, setSafe] = useState(readSafeRendering);
  const [rendererGeneration, setRendererGeneration] = useState(0);
  const [preparation, setPreparation] = useState<PreparationStatus>('loading');
  const [modelRetry, setModelRetry] = useState(0);
  const retryRenderer = () => {
    rememberSafeRendering(); setSafe(true); setPreparation('loading'); setRendererGeneration(value => value + 1);
  };
  const onPreparation = useCallback((status: PreparationStatus) => {
    setPreparation(status);
    if (status === 'context-lost') setSafe(true);
  }, []);
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
  const lights = useMemo(() => lightNodes(spatialDocument), [spatialDocument]);
  const points = useMemo(() => viewPoints(spatialDocument), [spatialDocument]);
  const orbitRef = useRef<OrbitControlType>(null);
  const tour = useViewPointTour(spatialDocument, points.length, mobile, editorMode);
  const pointIndex = tour.index;
  const point = pointIndex === undefined ? undefined : points[pointIndex];
  const cameraMode = point ? 'pov' : 'orbit';
  // A thin editor selection must not carry its tiny near plane into a room tour:
  // it loses depth precision and makes closely spaced model surfaces z-fight.
  const sceneScale = cameraSceneScale(cameraSizingNodes, point ? undefined : selectedNode, DEFAULT_CAMERA_POSITION);
  const selectionBounds = point ? undefined : selectedNode?.bounds;
  const clips = cameraClipPlanes(sceneScale, cameraSizingNodes, DEFAULT_CAMERA_POSITION, selectionBounds);
  const orbitTarget = useMemo(() => {
    return selectedNode?.transform.position ?? DEFAULT_ORBIT_TARGET;
  }, [selectedNode]);

  const invalidateRef = useRef<() => void>(() => {});
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const diagnostics = import.meta.env.DEV && new URLSearchParams(location.search).has('renderDiagnostics');
  const cameraRef = useRef<ThreePerspectiveCamera>(null);

  return (
    <div className="scene-viewport">
    <RendererBoundary key={rendererGeneration} onRetry={retryRenderer}>
    <Canvas
      className="scene-canvas"
      {...PERFORMANCE_CANVAS}
      shadows={!safe}
      gl={{ antialias: quality !== 'low' && !safe }}
      dpr={[1, safe ? 1 : QUALITY[quality].dpr]}
      fallback={<div className="scene-preparation" role="alert">This browser could not start WebGL. Try another browser or device.</div>}
      onCreated={({ invalidate, gl }) => { invalidateRef.current = invalidate; rendererRef.current = gl; }}
      onPointerMissed={() => {
        if (cameraMode === 'orbit') onSelectNode?.(undefined);
      }}
    >
      <ModelRuntime onPreparation={onPreparation} retry={modelRetry} onStatus={import.meta.env.DEV ? setAssetStatus : undefined}>
      <color attach="background" args={['#151820']} />
      <PerspectiveCamera ref={cameraRef} makeDefault position={DEFAULT_CAMERA_POSITION} fov={45} near={clips.near} far={clips.far} />
      <Lighting document={spatialDocument} />
      {editorMode && <XyzCornerGrid {...roomDimensions} />}
      <SpatialScene document={spatialDocument} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} selectionEnabled={cameraMode === 'orbit'} tourMode={Boolean(point)} maxTier={point && quality !== 'low' ? 'detail' : QUALITY[quality].maxTier} onPrecisionScaleChange={handleModelPrecisionScaleChange}/>
      {editorMode && !point && points.map(node => (
        <ViewPointMarker key={node.id} node={node} selected={node.id === selectedNodeId} onSelect={onSelectNode} />
      ))}
      {editorMode && !point && lights.map(node => (
        <LightSourceMarker key={node.id} node={node} selected={node.id === selectedNodeId} onSelect={onSelectNode} />
      ))}
      {selectedNode && !point && (editorMode || (!selectedNode.metadata?.viewPoint && !selectedNode.light)) ? <SelectionBounds node={selectedNode} /> : null}
      {cameraMode === 'orbit' ? <OrbitControls ref={orbitRef} makeDefault target={orbitTarget} maxPolarAngle={Math.PI} /> : null}
      <ViewPointControls point={point} orbitTarget={tour.orbitTarget} onTraverse={tour.traverse} onExit={tour.exit} />
      <CameraClipController nodes={cameraSizingNodes} scale={sceneScale} selectionBounds={selectionBounds} />
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
    {preparation !== 'ready' && <div className="scene-preparation" aria-live="polite" data-model-preparation={preparation}>
      <span>{preparation === 'context-lost' ? 'Graphics were interrupted. Recovering with reduced graphics…' : preparation === 'error' ? 'The scene could not be prepared. Check its model assets or retry.' : 'Preparing your scene…'}</span>
      {import.meta.env.DEV && preparation === 'error' && assetStatus?.errors.map(error => <small key={error}>{error}</small>)}
      {preparation === 'error' && <button onClick={() => setModelRetry(value => value + 1)}>Retry models</button>}
      {preparation === 'context-lost' && <button onClick={retryRenderer}>Restart viewer</button>}
    </div>}
    </RendererBoundary>
    {diagnostics && <button style={{ position: 'absolute', bottom: 100, left: 12, zIndex: 30 }} onClick={() => {
      const extension = rendererRef.current?.getContext().getExtension('WEBGL_lose_context');
      if (!extension) return;
      extension.loseContext();
      setTimeout(() => extension.restoreContext(), 1000);
    }}>Test graphics recovery</button>}
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
