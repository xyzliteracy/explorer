import { Mesh, Raycaster, Vector3, type Camera, type Matrix4, type Scene } from 'three';
const cache = new WeakMap<Scene, { frame: number; walls: Mesh[] }>();
const ray = new Raycaster();
const origin = new Vector3();
const point = new Vector3();
const direction = new Vector3();
const depth = new Vector3();
const corners = [-.5, .5].flatMap(x => [-.5, .5].flatMap(y => [-.5, .5].map(z => new Vector3(x, y, z))));

/** A conservative proof of full occlusion, not a center-ray visibility guess.
 * Only an opaque BoxGeometry face can qualify. All eight fitted-box corners
 * must lie behind that same convex face; then the complete projected box is
 * covered. CSG/cutout walls, transparent surfaces and other models cannot qualify.
 */
export function modelOccluded(camera: Camera, scene: Scene, world: Matrix4, frame: number): boolean {
  let entry = cache.get(scene);
  if (!entry || entry.frame !== frame) {
    const walls: Mesh[] = [];
    scene.traverse(object => {
      if (!(object instanceof Mesh) || object.geometry.type !== 'BoxGeometry' || object.userData.geometry !== 'box') return;
      for (let parent = object as import('three').Object3D | null; parent; parent = parent.parent) {
        if (!parent.visible || parent.userData.model) return;
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some(material => !material.visible || material.transparent || material.opacity !== 1 || material.alphaTest > 0 || material.alphaHash || !material.depthWrite || Boolean(material.clippingPlanes?.length) || ('wireframe' in material && material.wireframe))) return;
      object.updateWorldMatrix(true, false);
      walls.push(object);
    });
    entry = { frame, walls }; cache.set(scene, entry);
  }
  camera.getWorldPosition(origin);
  for (const wall of entry.walls) {
    if (!camera.layers.test(wall.layers)) continue;
    let face: number | undefined;
    let covered = true;
    for (const corner of corners) {
      point.copy(corner).applyMatrix4(world);
      const distance = point.distanceTo(origin);
      if (distance <= .001) { covered = false; break; }
      direction.subVectors(point, origin).normalize();
      ray.set(origin, direction); ray.near = .0001; ray.far = distance - .001;
      const hit = ray.intersectObject(wall, false)[0];
      const near = 'near' in camera ? Number(camera.near) : 0;
      if (hit && -depth.copy(hit.point).applyMatrix4(camera.matrixWorldInverse).z <= near) { covered = false; break; }
      const plane = hit?.faceIndex == null ? undefined : Math.floor(hit.faceIndex / 2);
      if (plane === undefined || (face !== undefined && face !== plane)) { covered = false; break; }
      face = plane;
    }
    if (covered) return true;
  }
  return false;
}
