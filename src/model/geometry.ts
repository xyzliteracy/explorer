import type { XyzDslBoxSpec, XyzDslCsgOperation, XyzDslGeometrySpec } from '../xyzdsl/types';

export interface SpatialGeometry {
  kind: XyzDslGeometrySpec['kind'];
  dimensions: [number, number, number];
  'box-radius'?: number;
  puff?: number;
  operation?: XyzDslCsgOperation;
}

export function geometryFromBox(box: XyzDslBoxSpec, spec: XyzDslGeometrySpec): SpatialGeometry {
  return {
    kind: spec.kind,
    dimensions: [box.width, box.height, box.depth],
    ...(spec['box-radius'] === undefined ? {} : { 'box-radius': spec['box-radius'] }),
    ...(spec.puff === undefined ? {} : { puff: spec.puff }),
    ...(spec.operation === undefined ? {} : { operation: spec.operation }),
  };
}
