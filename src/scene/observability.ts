import { clippedMeshRaycast } from './clipping';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Vector3, type Matrix4 } from 'three';
import type { SpatialNode } from '../model/SpatialNode';
import { matrixFromTransform } from '../model/transform';
import type { XyzDslObservable } from '../xyzdsl/types';

/** The center plane is opaque on the boundary and see-through on the named side. */
export function observableFrom(observable: XyzDslObservable | undefined, camera: Vector3, inverse: Matrix4, scratch = new Vector3()): boolean {
  if (!observable) return false;
  scratch.copy(camera).applyMatrix4(inverse);
  const distance = scratch[observable[1] as 'x' | 'y' | 'z'];
  return (observable[0] === '+' ? distance : -distance) > 1e-9;
}

// Hidden meshes let picking rays through. Collision uses geometry directly.
export const observableRaycast: Mesh['raycast'] = function (this: Mesh, raycaster, intersections) {
  if (this.visible) clippedMeshRaycast.call(this, raycaster, intersections);
};

export function useObservableMesh(node: SpatialNode) {
  const ref = useRef<Mesh>(null);
  const inverse = useMemo(() => matrixFromTransform(node.transform).invert(), [node.transform]);
  const cameraPosition = useMemo(() => new Vector3(), []);
  const scratch = useMemo(() => new Vector3(), []);
  // Controls run at -1; visibility/occlusion consumers run at 0.
  useFrame(({ camera }) => {
    const mesh = ref.current;
    if (!mesh) return;
    camera.getWorldPosition(cameraPosition);
    const hidden = observableFrom(node.material.observable, cameraPosition, inverse, scratch);
    mesh.visible = !hidden;
    mesh.userData.observableHidden = hidden;
    mesh.raycast = observableRaycast;
  }, -0.5);
  return ref;
}
