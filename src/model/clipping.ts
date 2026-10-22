import { Matrix4, Plane, Vector3 } from 'three';
import type { SpatialBounds } from './SpatialNode';
import type { AxisName } from '../xyzdsl/types';

export interface ClipPlane { normal: [number, number, number]; constant: number }
export const CLIP_EPSILON = 1e-8;
export function threeClipPlanes(planes: readonly ClipPlane[] = []): Plane[] {
  return planes.map(p => new Plane(new Vector3(...p.normal), p.constant));
}
function distanceToPlane(point: Vector3, plane: ClipPlane): number {
  return point.x * plane.normal[0] + point.y * plane.normal[1] + point.z * plane.normal[2] + plane.constant;
}
export function insideClipPlanes(point: Vector3, planes: readonly ClipPlane[]): boolean {
  return planes.every(p => distanceToPlane(point, p) >= -CLIP_EPSILON);
}

/** Parent axes, transformed into world space independently of the repeated child rotation. */
export function repeatClipPlanes(axes: { axis: AxisName; extent: number; start?: number }[], parentMatrix: Matrix4): ClipPlane[] {
  return axes.flatMap(({ axis, extent, start = 0 }) => {
    const normal = new Vector3(); normal[axis] = 1;
    return [new Plane(normal, -start), new Plane(normal.clone().negate(), start + extent)]
      .map(p => p.applyMatrix4(parentMatrix))
      .map(p => ({ normal: p.normal.toArray() as [number, number, number], constant: p.constant }));
  });
}

/** Convex polygon clipping; used on collision triangles so hidden parts cannot block movement. */
export function clipPolygon(points: Vector3[], planes: readonly ClipPlane[]): Vector3[] {
  let polygon = points;
  for (const plane of planes) {
    const output: Vector3[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const da = distanceToPlane(a, plane), db = distanceToPlane(b, plane);
      const aInside = da >= 0, bInside = db >= 0;
      if (aInside) output.push(a);
      if (aInside !== bInside) output.push(a.clone().lerp(b, da / (da - db)));
    }
    polygon = output;
    if (!polygon.length) break;
  }
  return polygon;
}

/** Intersect a conservative world AABB with all clip half spaces, including rotated ones. */
export function clippedBounds(bounds: SpatialBounds, clips: readonly ClipPlane[]): SpatialBounds | undefined {
  if (!clips.length) return bounds;
  const planes = threeClipPlanes([
    { normal: [1, 0, 0], constant: -bounds.minX }, { normal: [-1, 0, 0], constant: bounds.maxX },
    { normal: [0, 1, 0], constant: -bounds.minY }, { normal: [0, -1, 0], constant: bounds.maxY },
    { normal: [0, 0, 1], constant: -bounds.minZ }, { normal: [0, 0, -1], constant: bounds.maxZ }, ...clips,
  ]);
  const points: Vector3[] = [];
  // Vertices of a bounded convex polyhedron occur at intersections of three planes.
  for (let i = 0; i < planes.length; i++) for (let j = i + 1; j < planes.length; j++) for (let k = j + 1; k < planes.length; k++) {
    const a = planes[i], b = planes[j], c = planes[k];
    const bc = new Vector3().crossVectors(b.normal, c.normal);
    const determinant = a.normal.dot(bc);
    if (Math.abs(determinant) < 1e-12) continue;
    const point = bc.multiplyScalar(-a.constant)
      .add(new Vector3().crossVectors(c.normal, a.normal).multiplyScalar(-b.constant))
      .add(new Vector3().crossVectors(a.normal, b.normal).multiplyScalar(-c.constant))
      .divideScalar(determinant);
    if (planes.every(p => p.distanceToPoint(point) >= -CLIP_EPSILON)) points.push(point);
  }
  if (!points.length) return undefined;
  return {
    minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
    minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)),
    minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z)),
  };
}
