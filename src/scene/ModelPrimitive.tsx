import { cutModelInstance } from './modelCsg';
import { observableFrom } from './observability';
import { matrixFromTransform } from '../model/transform';
import { threeClipPlanes } from '../model/clipping';
import { clippedMeshRaycast, installClippedRaycast } from './clipping';
import { useFrame } from '@react-three/fiber';
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { useModelAsset, useOriginalModelAsset, useModelPresentation, useModelRetryGeneration, useModelMemoryPressure, useModelSceneRevealed } from '../performance/ModelRuntime';
import { modelScreenPixels, type ModelTier } from '../performance/modelVisibility';
import { currentModelUpgradePolicy } from '../performance/modelUpgradeMemory';
import { modelOccluded } from '../performance/modelOcclusion';
import { criticallyUnderpoweredDevice } from '../performance/renderQuality';
import type { ThreeEvent } from '@react-three/fiber';
import { SkeletonUtils } from 'three-stdlib';
import { Box3, Vector3, Color, type Material, type Mesh, type Object3D, type Group } from 'three';
import type { SpatialNode } from '../model/SpatialNode';
import { modelVariantSource, originalModelSource, resolveModelVariants } from '../model/modelVariants';
import { useAssetResolver } from '../assets';
import { modelFitTransformFromBounds, renderedModelPrecisionScale } from './modelFit';
import { shouldSelectFromClick } from './selectionClick';
import { reorientModel } from './modelReorientation';

function ModelFailure({ error }: { error?: Error }) {
  useModelPresentation(false, error);
  return null;
}

class ModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; error?: Error }> {
  state: { failed: boolean; error?: Error } = { failed: false };
  static getDerivedStateFromError(error: Error) { return { failed: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Unable to render GLB model.', error, info); }
  render() { return this.state.failed ? <ModelFailure error={this.state.error} /> : this.props.children; }
}

// Model presentation with injectable asset transport.
export function ModelObject({ scene, fit, align, node, targetScale, onPrecisionScaleChange }: { scene: Object3D; fit: 'contain' | 'stretch'; align: 'center' | 'floor'; node: SpatialNode; targetScale: [number, number, number]; onPrecisionScaleChange?: (scale: number | undefined) => void }) {
  const imported = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    const clippingPlanes = threeClipPlanes(node.clippingPlanes);
    const ownedMaterials = new Set<Material>();
    const ownedSkeletons = new Set<import('three').Skeleton>();
    clone.traverse((object) => {
      if ('isLight' in object || 'isCamera' in object) object.visible = false;
      if ('skeleton' in object) ownedSkeletons.add(object.skeleton as import('three').Skeleton);
      if (!('isMesh' in object)) return;
      const mesh = object as Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (clippingPlanes.length || node.surfaceVisibility) installClippedRaycast(mesh);
      if (!clippingPlanes.length && node.material.color === undefined && node.material.metalness === undefined && node.material.roughness === undefined) return;
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((sourceMaterial) => {
        const material = sourceMaterial.clone() as Material & { color?: Color; metalness?: number; roughness?: number };
        ownedMaterials.add(material);
        if (clippingPlanes.length) {
          material.clippingPlanes = clippingPlanes;
          material.clipIntersection = false;
          material.clipShadows = true;
        }
        if (node.material.color !== undefined && material.color) material.color = new Color(node.material.color);
        if (node.material.metalness !== undefined && material.metalness !== undefined) material.metalness = node.material.metalness;
        if (node.material.roughness !== undefined && material.roughness !== undefined) material.roughness = node.material.roughness;
        return material;
      });
      mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
    });
    clone.updateWorldMatrix(true, true);
    const prepared = scene.userData.xyzFitBounds;
    const validBounds = prepared && ['min', 'max'].every(key => Array.isArray(prepared[key]) && prepared[key].length === 3 && prepared[key].every((value: unknown) => typeof value === 'number' && Number.isFinite(value)));
    const bounds = validBounds ? new Box3(new Vector3(...prepared.min as [number, number, number]), new Vector3(...prepared.max as [number, number, number])) : new Box3().setFromObject(clone);
    const oriented = reorientModel(clone, bounds, node.model?.reorientation);
    return { ...oriented, ownedMaterials, ownedSkeletons };
  }, [scene, node.material.color, node.material.metalness, node.material.roughness, node.clippingPlanes, node.model?.reorientation, node.surfaceVisibility]);
  useEffect(() => () => { imported.ownedMaterials.forEach(material => material.dispose()); imported.ownedSkeletons.forEach(skeleton => skeleton.dispose()); }, [imported]);
  const fitted = useMemo(
    () => modelFitTransformFromBounds(imported.bounds, fit, align, targetScale),
    [imported.bounds, fit, align, targetScale],
  );
  useEffect(() => {
    onPrecisionScaleChange?.(renderedModelPrecisionScale(imported.bounds, fitted.scale, targetScale));
    return () => onPrecisionScaleChange?.(undefined);
  }, [fitted.scale, imported.bounds, onPrecisionScaleChange, targetScale]);
  const cut = useMemo(() => {
    if (!node.modelCsgOperations?.length) return undefined;
    const result = cutModelInstance(imported.scene, node, fitted);
    if (node.clippingPlanes?.length || node.surfaceVisibility) result.scene.traverse(object => { if ('isMesh' in object) installClippedRaycast(object as Mesh); });
    return result;
  }, [imported.scene, node.modelCsgOperations, node.transform, fitted]);
  useEffect(() => () => cut?.dispose(), [cut]);
  return <group scale={fitted.scale}><group position={fitted.position}><primitive object={cut?.scene ?? imported.scene} dispose={null} /></group></group>;
}

export function StreamingModel({ node, tier, resolved, originalNeeded = false, originalPriority = 1000, onRetainOriginal, onPrecisionScaleChange }: { originalPriority?: number; onRetainOriginal?: () => void; originalNeeded?: boolean; tourOriginal?: boolean; tourMode?: boolean; node: SpatialNode; tier: ModelTier; resolved: boolean; selected: boolean; onPrecisionScaleChange?: (value: number | undefined) => void }) {
  const resolveModelUrl = useAssetResolver();
  const model = node.model!;
  // The textured baseline never depends on the camera. Original fidelity is
  // promoted separately and may be released only after sustained absence.
  const source = tier === 'preview' ? resolveModelVariants(model).previewSource
    : model.detailSource ?? (model.source && modelVariantSource(model.source, 'detail'));
  const resolve = (url: string | undefined) => url ? (resolved ? url : resolveModelUrl(url)) : undefined;
  const targetUrl = resolve(source);
  const target = useModelAsset(targetUrl, 2000);
  // A missing explicit detail or inferred preview must not leave an empty slot.
  const fallbackSource = tier === 'preview' ? model.source : model.source && originalModelSource(model.source);
  const fallbackUrl = target?.error && source !== fallbackSource ? resolve(fallbackSource) : undefined;
  const fallback = useModelAsset(fallbackUrl, 2000);
  const originalUrl = originalNeeded && !model.detailSource && tier !== 'preview' && model.source ? resolve(originalModelSource(model.source)) : undefined;
  const original = useOriginalModelAsset(originalUrl === targetUrl || originalUrl === fallbackUrl ? undefined : originalUrl, originalPriority);
  const baseline = target?.value ? target : fallback?.value ? fallback : undefined;
  const asset = original?.value ? original : baseline;
  const revealed = useModelSceneRevealed();
  useEffect(() => {
    // Extremely aggressive inferred simplification is unsafe for close-up UV
    // fidelity. Once inspected at original quality, preserve it for this model.
    if (original?.value && target?.value && original.triangles > target.triangles * 32) onRetainOriginal?.();
  }, [original?.value, original?.triangles, target?.value, target?.triangles, onRetainOriginal]);
  const error = fallbackUrl ? fallback?.error : target?.error;
  useModelPresentation(Boolean(asset?.value) && (revealed || !originalUrl || originalUrl === fallbackUrl || originalUrl === targetUrl || Boolean(original?.value || original?.error)), error);
  if (!asset?.value) {
    return null;
  }
  return <ModelObject scene={asset.value.scene} fit={model.fit} align={model.align} node={node} targetScale={node.transform.scale} onPrecisionScaleChange={onPrecisionScaleChange} />;
}

export function ModelPrimitive({ node, onSelect, selectionEnabled = true, onPrecisionScaleChange, resolved = false, selected = false, tourMode = false }: { tourMode?: boolean; selected?: boolean; maxTier?: ModelTier; node: SpatialNode; onSelect?: (id: string) => void; selectionEnabled?: boolean; onPrecisionScaleChange?: (id: string, scale: number | undefined) => void; resolved?: boolean }) {
  const model = node.model!;
  const { position, rotation, scale } = node.transform;
  const [critical] = useState(criticallyUnderpoweredDevice);
  const [constrained] = useState(() => currentModelUpgradePolicy().constrained);
  const [originalPriority, setOriginalPriority] = useState(1000);
  const recovery = useModelRetryGeneration();
  const pressure = useModelMemoryPressure();
  const group = useRef<Group>(null);
  const surfaceInverse = useMemo(() => node.surfaceVisibility ? matrixFromTransform(node.surfaceVisibility.transform).invert() : undefined, [node.surfaceVisibility]);
  const surfaceCamera = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    if (!group.current || !surfaceInverse) return;
    const hidden = observableFrom(node.surfaceVisibility?.observable, camera.getWorldPosition(surfaceCamera), surfaceInverse);
    group.current.visible = !hidden;
    group.current.userData.observableHidden = hidden;
  }, -0.5);
  const [originalNeeded, setOriginalNeeded] = useState(false);
  const [retainOriginal, setRetainOriginal] = useState(false);
  const preserveOriginal = useCallback(() => setRetainOriginal(true), []);
  const coldTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const guarded = useRef(false);
  const pressureRef = useRef(pressure);
  pressureRef.current = pressure;
  useEffect(() => { setRetainOriginal(false); return () => { clearTimeout(coldTimer.current); coldTimer.current = undefined; }; }, [model.source]);
  useFrame(({ camera, size, scene, gl }) => {
    if (!group.current || critical || model.detailSource) return;
    group.current.updateWorldMatrix(true, false);
    // Detail should follow rendered pixels, including on small high-DPI screens.
    const renderedHeight = size.height * (gl?.getPixelRatio?.() ?? 1);
    const pixels = modelScreenPixels(camera, group.current.matrixWorld, renderedHeight);
    const ahead = modelScreenPixels(camera, group.current.matrixWorld, renderedHeight, 1.75);
    // Prefetch a wide guard around nearby models; once promoted, retain full
    // fidelity for the entire visible interval, even when its screen size shrinks.
    const occluded = Boolean(!retainOriginal && !selected && (pixels > 0 || ahead >= 400) && scene && gl && modelOccluded(camera, scene, group.current.matrixWorld, gl.info.render.frame));
    guarded.current = retainOriginal || (!occluded && (pixels > 0 || ahead >= 400)) || selected;
    const priority = selected ? 4000 : !occluded && pixels >= 400 ? 3000 : 1000;
    if (priority !== originalPriority) setOriginalPriority(priority);
    if (selected || (!occluded && (pixels >= 400 || (!constrained && ahead >= 400)))) {
      if (!originalNeeded) setOriginalNeeded(true);
    }
    if (guarded.current || !pressure || !originalNeeded) {
      clearTimeout(coldTimer.current); coldTimer.current = undefined;
    } else if (coldTimer.current === undefined) {
      coldTimer.current = setTimeout(() => {
        coldTimer.current = undefined;
        if (group.current) {
          group.current.updateWorldMatrix(true, false);
          const hidden = Boolean(scene && gl && modelOccluded(camera, scene, group.current.matrixWorld, gl.info.render.frame));
          const currentRenderedHeight = size.height * (gl?.getPixelRatio?.() ?? 1);
          if (!hidden && (modelScreenPixels(camera, group.current.matrixWorld, currentRenderedHeight) > 0 ||
              modelScreenPixels(camera, group.current.matrixWorld, currentRenderedHeight, 1.75) >= 400)) return;
        }
        if (!guarded.current && pressureRef.current) setOriginalNeeded(false);
      }, 8000);
    }
  });
  const tier: ModelTier = critical ? 'preview' : 'detail';
  const handlePrecisionScaleChange = useCallback(
    (precisionScale: number | undefined) => onPrecisionScaleChange?.(node.id, precisionScale),
    [node.id, onPrecisionScaleChange],
  );
  function handleClick(event: ThreeEvent<MouseEvent>) { event.stopPropagation(); if (shouldSelectFromClick(selectionEnabled, event)) onSelect?.(node.id); }
  return <group ref={group} position={position} rotation={rotation} scale={scale} onClick={handleClick} userData={{ spatialNodeId: node.id, model: model.source, xyzClippingPlanes: node.clippingPlanes }}>
    <ModelErrorBoundary key={`${model.source}:${model.previewSource}:${model.detailSource}:${model.fit}:${model.align}:${recovery}`}>
      <Suspense fallback={<ModelFailure />}><StreamingModel node={node} tier={tier} originalNeeded={originalNeeded} originalPriority={originalPriority} onRetainOriginal={preserveOriginal} resolved={resolved} selected={selected} tourMode={tourMode} onPrecisionScaleChange={handlePrecisionScaleChange} /></Suspense>
    </ModelErrorBoundary>
    <mesh raycast={clippedMeshRaycast} userData={{ povCollisionIgnored: true }}>
      <boxGeometry />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  </group>;
}
