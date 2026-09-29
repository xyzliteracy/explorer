import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useModelAsset } from '../performance/ModelRuntime';
import { requestedModelTier, modelScreenPixels, modelTierSource, type ModelTier } from '../performance/modelVisibility';
import type { ThreeEvent } from '@react-three/fiber';
import { SkeletonUtils } from 'three-stdlib';
import { Box3, Vector3, Color, type Material, type Mesh, type Object3D, type Group } from 'three';
import type { SpatialNode } from '../model/SpatialNode';
import { resolveModelUrl } from '../model/resolveModelUrl';
import { modelFitTransformFromBounds, renderedModelPrecisionScale } from './modelFit';
import { shouldSelectFromClick } from './selectionClick';

function ModelBox({ color }: { color: string }) {
  return <mesh><boxGeometry /><meshStandardMaterial color={color} wireframe transparent opacity={0.45} /></mesh>;
}

class ModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Unable to render GLB model.', error, info); }
  render() { return this.state.failed ? <ModelBox color="#ef4444" /> : this.props.children; }
}

// Model presentation with injectable asset transport.
export function ModelObject({ scene, fit, align, node, targetScale, onPrecisionScaleChange }: { scene: Object3D; fit: 'contain' | 'stretch'; align: 'center' | 'floor'; node: SpatialNode; targetScale: [number, number, number]; onPrecisionScaleChange?: (scale: number | undefined) => void }) {
  const imported = useMemo(() => {
    const clone = SkeletonUtils.clone(scene);
    const ownedMaterials = new Set<Material>();
    const ownedSkeletons = new Set<import('three').Skeleton>();
    clone.traverse((object) => {
      if ('isLight' in object || 'isCamera' in object) object.visible = false;
      if ('skeleton' in object) ownedSkeletons.add(object.skeleton as import('three').Skeleton);
      if (!('isMesh' in object)) return;
      const mesh = object as Mesh;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      if (node.material.color === undefined && node.material.metalness === undefined && node.material.roughness === undefined) return;
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((sourceMaterial) => {
        const material = sourceMaterial.clone() as Material & { color?: Color; metalness?: number; roughness?: number };
        ownedMaterials.add(material);
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
    return { scene: clone, bounds, ownedMaterials, ownedSkeletons };
  }, [scene, node.material.color, node.material.metalness, node.material.roughness]);
  useEffect(() => () => { imported.ownedMaterials.forEach(material => material.dispose()); imported.ownedSkeletons.forEach(skeleton => skeleton.dispose()); }, [imported]);
  const fitted = useMemo(
    () => modelFitTransformFromBounds(imported.bounds, fit, align, targetScale),
    [imported.bounds, fit, align, targetScale],
  );
  useEffect(() => {
    onPrecisionScaleChange?.(renderedModelPrecisionScale(imported.bounds, fitted.scale, targetScale));
    return () => onPrecisionScaleChange?.(undefined);
  }, [fitted.scale, imported.bounds, onPrecisionScaleChange, targetScale]);
  return <group scale={fitted.scale}><group position={fitted.position}><primitive object={imported.scene} dispose={null} /></group></group>;
}

function StreamingModel({ node, tier, resolved, selected, onPrecisionScaleChange }: { node: SpatialNode; tier: ModelTier; resolved: boolean; selected: boolean; onPrecisionScaleChange?: (value: number | undefined) => void }) {
  const model = node.model!;
  const source = modelTierSource(model, tier);
  const resolve = (url: string | undefined) => url ? (resolved ? url : resolveModelUrl(url)) : undefined;
  const previewUrl = tier !== 'none' ? resolve(model.previewSource) : undefined;
  const targetUrl = resolve(source);
  const preview = useModelAsset(previewUrl, selected ? 3000 : 1000);
  const target = useModelAsset(targetUrl === previewUrl ? undefined : targetUrl, selected ? 2000 : tier === 'detail' ? 100 : 500, selected ? 2000 : tier === 'detail' ? 900 : 500);
  const asset = target?.value ? target : preview?.value ? preview : undefined;
  if (!asset?.value) {
    const error = target?.error ?? preview?.error;
    return <><ModelBox color={error ? '#efad44' : '#60a5fa'} />{error && <Html center><span role="status" title={error.message} style={{ display: 'block', width: 160, padding: 6, background: '#171c26', color: '#ffcf85', fontSize: 12 }}>{error.message.includes('budget') ? 'Use an optimized model for this device' : 'Model could not be loaded'}</span></Html>}</>;
  }
  return <ModelObject scene={asset.value.scene} fit={model.fit} align={model.align} node={node} targetScale={node.transform.scale} onPrecisionScaleChange={onPrecisionScaleChange} />;
}

export function ModelPrimitive({ node, onSelect, selectionEnabled = true, onPrecisionScaleChange, resolved = false, selected = false, maxTier = 'detail' }: { selected?: boolean; maxTier?: ModelTier; node: SpatialNode; onSelect?: (id: string) => void; selectionEnabled?: boolean; onPrecisionScaleChange?: (id: string, scale: number | undefined) => void; resolved?: boolean }) {
  const model = node.model!;
  const { position, rotation, scale } = node.transform;
  const group = useRef<Group>(null);
  const [tier, setTier] = useState<ModelTier>('none');
  const unloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(unloadTimer.current), []);
  useFrame(({ camera, size }) => {
    if (!group.current) return;
    group.current.updateWorldMatrix(true, false);
    const next = requestedModelTier(modelScreenPixels(camera, group.current.matrixWorld, size.height), tier, selected, maxTier);
    if (next === 'none' && tier !== 'none') {
      // A timer also expires when demand rendering is idle outside the view.
      if (unloadTimer.current === undefined) unloadTimer.current = setTimeout(() => {
        unloadTimer.current = undefined;
        setTier('none');
      }, 750);
    } else {
      clearTimeout(unloadTimer.current);
      unloadTimer.current = undefined;
      if (next !== tier) setTier(next);
    }
  });
  const handlePrecisionScaleChange = useCallback(
    (precisionScale: number | undefined) => onPrecisionScaleChange?.(node.id, precisionScale),
    [node.id, onPrecisionScaleChange],
  );
  function handleClick(event: ThreeEvent<MouseEvent>) { event.stopPropagation(); if (shouldSelectFromClick(selectionEnabled, event)) onSelect?.(node.id); }
  return <group ref={group} position={position} rotation={rotation} scale={scale} onClick={handleClick} userData={{ spatialNodeId: node.id, model: model.source }}>
    <ModelErrorBoundary key={`${model.source}:${model.previewSource}:${model.detailSource}:${model.fit}:${model.align}`}>
      <Suspense fallback={<ModelBox color="#60a5fa" />}><StreamingModel node={node} tier={tier} resolved={resolved} selected={selected} onPrecisionScaleChange={handlePrecisionScaleChange} /></Suspense>
    </ModelErrorBoundary>
    <mesh userData={{ povCollisionIgnored: true }}>
      <boxGeometry />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  </group>;
}
