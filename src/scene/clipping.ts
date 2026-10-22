import { Mesh, type Intersection, type Object3D } from 'three';
import { insideClipPlanes, type ClipPlane } from '../model/clipping';

/** Each node's planes already include ancestor constraints; use the nearest set. */
export function objectClipPlanes(object: Object3D): readonly ClipPlane[] {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (current.userData.xyzClippingPlanes) return current.userData.xyzClippingPlanes;
  }
  return [];
}
export function filterClippedHits(object: Object3D, hits: Intersection[], start: number): void {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (!current.visible && current.userData.observableHidden) { hits.splice(start); return; }
  }
  const planes = objectClipPlanes(object);
  if (!planes.length) return;
  for (let i = hits.length - 1; i >= start; i--) {
    if (!insideClipPlanes(hits[i].point, planes)) hits.splice(i, 1);
  }
}
export const clippedMeshRaycast: Mesh['raycast'] = function (this: Mesh, raycaster, hits) {
  const start = hits.length;
  Mesh.prototype.raycast.call(this, raycaster, hits);
  filterClippedHits(this, hits, start);
};

/** Preserve imported subclasses' raycasts, including SkinnedMesh and InstancedMesh. */
export function installClippedRaycast(mesh: Mesh): void {
  const raycast = mesh.raycast;
  mesh.raycast = function (this: Mesh, raycaster, hits) {
    const start = hits.length;
    raycast.call(this, raycaster, hits);
    filterClippedHits(this, hits, start);
  };
}
