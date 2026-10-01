import { Box3, Frustum, Matrix4, Sphere, Vector3, type Camera, type PerspectiveCamera } from 'three';
import type { SpatialNode } from '../model/SpatialNode';
const matrix = new Matrix4();
const frustum = new Frustum();
const sphere = new Sphere();
const center = new Vector3();
const box = new Box3(new Vector3(-.5, -.5, -.5), new Vector3(.5, .5, .5));

/** Uses the declared fitted box, including rotation, before the asset exists. */
export function modelScreenPixels(camera: Camera, worldMatrix: Matrix4, height: number) {
  camera.updateMatrixWorld();
  matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(matrix);
  box.getBoundingSphere(sphere).applyMatrix4(worldMatrix);
  if (!frustum.intersectsSphere(sphere)) return 0;
  const perspective = camera as PerspectiveCamera;
  if (!perspective.isPerspectiveCamera) return height * sphere.radius * Math.abs(camera.projectionMatrix.elements[5]);
  center.copy(sphere.center).applyMatrix4(camera.matrixWorldInverse);
  const distance = Math.max(.0001, -center.z - sphere.radius);
  return Math.min(height * 4, height * sphere.radius / (distance * Math.tan(perspective.fov * Math.PI / 360)));
}

export type ModelTier = 'none' | 'preview' | 'standard' | 'detail';
export function chooseModelTier(pixels: number, previous: ModelTier): ModelTier {
  if (pixels < (previous === 'none' ? 12 : 6)) return 'none';
  if (pixels >= (previous === 'detail' ? 400 : 550)) return 'detail';
  if (pixels >= (previous === 'standard' || previous === 'detail' ? 110 : 170)) return 'standard';
  return 'preview';
}
export function modelTierSource(model: NonNullable<SpatialNode['model']>, tier: ModelTier) {
  if (tier === 'none') return undefined;
  if (tier === 'preview') return model.previewSource ?? model.source;
  if (tier === 'detail') return model.detailSource ?? model.source;
  return model.source;
}

/** Selection pins residency but still respects the device fidelity ceiling. */
export function requestedModelTier(pixels: number, previous: ModelTier, selected: boolean, ceiling: ModelTier = 'detail'): ModelTier {
  const levels: ModelTier[] = ['none', 'preview', 'standard', 'detail'];
  const desired = selected ? 'detail' : chooseModelTier(pixels, previous);
  return levels[Math.min(levels.indexOf(desired), levels.indexOf(ceiling))];
}
