import { threeClipPlanes } from '../model/clipping';
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
import { BoxGeometry, Quaternion, Vector3, type BufferGeometry } from 'three';
import type { CsgExpression, CsgOperationNode } from '../model/csg';
import type { SpatialNode } from '../model/SpatialNode';
import { bufferGeometryForSpatialGeometry } from './primitiveGeometry';

function brushFor(node: SpatialNode): Brush {
  const brush = new Brush(bufferGeometryForSpatialGeometry(node.geometry));
  const { position, rotation, scale } = node.transform;
  brush.position.set(...position);
  brush.rotation.set(...rotation);
  brush.scale.set(...scale);
  brush.updateMatrixWorld(true);
  brush.geometry.applyMatrix4(brush.matrixWorld);
  brush.position.set(0, 0, 0);
  brush.rotation.set(0, 0, 0);
  brush.scale.set(1, 1, 1);
  brush.updateMatrixWorld(true);
  // Clip each operand before boolean evaluation so a cropped subtraction tool
  // cannot cut geometry beyond its repeat parent, and unions retain their own scope.
  let result = brush;
  for (const plane of threeClipPlanes(node.clippingPlanes)) {
    result.geometry.computeBoundingBox();
    const bounds = result.geometry.boundingBox!;
    if (bounds.isEmpty()) break;
    const corners = [bounds.min.x, bounds.max.x].flatMap(x =>
      [bounds.min.y, bounds.max.y].flatMap(y => [bounds.min.z, bounds.max.z].map(z => new Vector3(x, y, z))));
    if (corners.every(p => plane.distanceToPoint(p) >= -1e-8)) continue;
    const center = bounds.getCenter(new Vector3());
    const size = 2 * (bounds.getSize(new Vector3()).length() + Math.abs(plane.distanceToPoint(center))) + 1;
    const cutterGeometry = new BoxGeometry(size, size, size);
    cutterGeometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), plane.normal));
    const location = plane.projectPoint(center, new Vector3()).addScaledVector(plane.normal, size / 2);
    cutterGeometry.translate(location.x, location.y, location.z);
    const cutter = new Brush(cutterGeometry);
    cutter.updateMatrixWorld(true);
    const evaluator = new Evaluator();
    evaluator.attributes = ['position', 'normal', 'uv'];
    const previous = result;
    result = evaluator.evaluate(result, cutter, INTERSECTION);
    previous.geometry.dispose();
    cutterGeometry.dispose();
  }
  return result;
}

function csgOperation({ op }: CsgOperationNode) {
  switch (op) {
    case 'union':
      return ADDITION;
    case 'intersection':
      return INTERSECTION;
    case 'subtraction':
    default:
      return SUBTRACTION;
  }
}

export function evaluateCsgExpressionGeometry(expression: CsgExpression): BufferGeometry {
  const evaluator = new Evaluator();
  evaluator.attributes = ['position', 'normal', 'uv'];
  let result = brushFor(expression.base);

  expression.operations.forEach((operation) => {
    result = evaluator.evaluate(result, brushFor(operation.tool), csgOperation(operation));
  });

  return result.geometry;
}

export interface EvaluatedCsgExpression {
  geometry: BufferGeometry;
  operationContributions: boolean[];
}

export function evaluateCsgExpressionWithContributions(expression: CsgExpression): EvaluatedCsgExpression {
  const evaluator = new Evaluator();
  evaluator.attributes = ['position', 'normal', 'uv'];
  let result = brushFor(expression.base);
  const operationContributions: boolean[] = [];

  expression.operations.forEach((operation) => {
    const before = csgGeometrySignature(result.geometry);
    result = evaluator.evaluate(result, brushFor(operation.tool), csgOperation(operation));
    operationContributions.push(!csgGeometrySignaturesEqual(before, csgGeometrySignature(result.geometry)));
  });

  return { geometry: result.geometry, operationContributions };
}

export interface CsgGeometrySignature {
  triangleCount: number;
  surfaceArea: number;
  bounds: number[];
}

export function csgGeometrySignature(geometry: BufferGeometry): CsgGeometrySignature {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const triangleCount = Math.floor((index?.count ?? position.count) / 3);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const edgeA = new Vector3();
  const edgeB = new Vector3();
  let surfaceArea = 0;

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = triangle * 3;
    a.fromBufferAttribute(position, index?.getX(offset) ?? offset);
    b.fromBufferAttribute(position, index?.getX(offset + 1) ?? offset + 1);
    c.fromBufferAttribute(position, index?.getX(offset + 2) ?? offset + 2);
    surfaceArea += edgeA.subVectors(b, a).cross(edgeB.subVectors(c, a)).length() / 2;
  }

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  return {
    triangleCount,
    surfaceArea,
    bounds: box ? [...box.min.toArray(), ...box.max.toArray()] : [],
  };
}

export function csgGeometrySignaturesEqual(left: CsgGeometrySignature, right: CsgGeometrySignature): boolean {
  const tolerance = Math.max(1, left.surfaceArea, right.surfaceArea) * 1e-7;
  return left.triangleCount === right.triangleCount
    && Math.abs(left.surfaceArea - right.surfaceArea) <= tolerance
    && left.bounds.length === right.bounds.length
    && left.bounds.every((value, index) => Math.abs(value - right.bounds[index]) <= tolerance);
}
