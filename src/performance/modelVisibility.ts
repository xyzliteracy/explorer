import { Box3, Frustum, Matrix4, Ray, Sphere, Vector3, type Camera, type PerspectiveCamera } from 'three';
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

const inverseWorld = new Matrix4();
const gaze = new Ray();
const gazeDirection = new Vector3();
const hit = new Vector3();

/** Test the forward ray against the fitted boundary in model-local space. */
export function cameraModelDistance(camera: Camera, worldMatrix: Matrix4): number {
  camera.updateMatrixWorld();
  if (worldMatrix.determinant() === 0) return Infinity;
  camera.getWorldPosition(gaze.origin);
  camera.getWorldDirection(gazeDirection);
  gaze.direction.copy(gazeDirection);
  gaze.applyMatrix4(inverseWorld.copy(worldMatrix).invert());
  if (!gaze.intersectBox(box, hit)) return Infinity;
  hit.applyMatrix4(worldMatrix);
  camera.getWorldPosition(center);
  return center.distanceTo(hit);
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
export function requestedModelTier(pixels: number, previous: ModelTier, selected: boolean, ceiling: ModelTier = 'detail', focused = false): ModelTier {
  const levels: ModelTier[] = ['none', 'preview', 'standard', 'detail'];
  const visible = chooseModelTier(pixels, previous);
  // Standard is the textured baseline; previews remain loading/budget fallbacks.
  const desired = selected || (focused && visible !== 'none') ? 'detail' : visible === 'preview' ? 'standard' : visible;
  return levels[Math.min(levels.indexOf(desired), levels.indexOf(ceiling))];
}

/** Two tour rings; size hysteresis still determines whether a model is resident.
 * Low-capability tours start one level lower and never request originals.
 */
export function requestedTourModelTier(pixels: number, previous: ModelTier, focused: boolean, sustained: boolean, underpowered: boolean): ModelTier {
  if (chooseModelTier(pixels, previous) === 'none') return 'none';
  if (underpowered) return focused ? sustained ? 'detail' : 'standard' : sustained ? 'standard' : 'preview';
  return focused || sustained ? 'detail' : 'standard';
}

export function cameraFacesModel(camera: Camera, worldMatrix: Matrix4): boolean {
  return Number.isFinite(cameraModelDistance(camera, worldMatrix));
}
