import { Box3, Group, type Object3D } from 'three';

/** Wrap a per-instance clone; preserve authored transforms and shared asset geometry. */
export function reorientModel(scene: Object3D, bounds: Box3, angles?: readonly [number, number, number]) {
  if (!angles || angles.every(angle => angle === 0)) return { scene, bounds };
  const oriented = new Group();
  oriented.rotation.set(...angles, 'XYZ');
  oriented.add(scene);
  oriented.updateWorldMatrix(true, true);
  // Use the same canonical bounds for every streaming tier.
  return { scene: oriented, bounds: bounds.clone().applyMatrix4(oriented.matrixWorld) };
}
